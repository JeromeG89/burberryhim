import os
from dotenv import load_dotenv
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException

import openai

load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")

router = APIRouter(tags=["openai"])


# =========================
# 1) QUESTIONS (6)
# =========================
class RequestBody(BaseModel):
    prompt: str


class ResponseBody(BaseModel):
    questions: list[str]


@router.post("/get-educational-questions", response_model=ResponseBody)
async def get_educational_questions(request: RequestBody):
    try:
        system_prompt = (
            "You are an educational assistant.\n"
            "IMPORTANT: The input text is from speech-to-text transcription and may contain wrong words, "
            "missing punctuation, filler words, or misheard technical terms.\n"
            "Your job: infer the student's intended meaning.\n"
            "Rules:\n"
            "- Ignore filler and obvious transcription errors.\n"
            "- If a term seems wrong, silently correct to the most likely technical term.\n"
            "- If there are multiple plausible meanings, pick the most likely one.\n"
            "- Generate exactly 6 short, distinct, helpful questions a student might ask next.\n"
            "- Output ONLY the 6 questions, one per line. No numbering, no bullets."
        )

        response = openai.ChatCompletion.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": f"Speech-to-text transcript (may contain errors): {request.prompt}",
                },
            ],
            max_tokens=500,
            temperature=0.7,
        )

        raw_text = response["choices"][0]["message"]["content"]
        lines = raw_text.strip().split("\n")

        # Clean up (just in case model returns bullets/numbers)
        questions = [line.lstrip("0123456789.-) ").strip() for line in lines if line.strip()]

        return ResponseBody(questions=questions[:6])

    except Exception as e:
        print(f"OpenAI Error: {e}")
        raise HTTPException(status_code=400, detail=f"Error: {str(e)}")


# =========================
# 2) EXPLANATION
# =========================
class ExplainRequestBody(BaseModel):
    prompt: str
    question: str


class ExplainResponseBody(BaseModel):
    explanation: str


@router.post("/get-educational-explanation", response_model=ExplainResponseBody)
async def get_educational_explanation(request: ExplainRequestBody):
    try:
        system_prompt = (
            "You are an educational assistant.\n"
            "IMPORTANT: The context is speech-to-text transcription and may contain wrong words, "
            "missing punctuation, filler words, or misheard technical terms.\n"
            "Do NOT get stuck on typos—infer the student's intent and explain accordingly.\n"
            "Rules:\n"
            "- First, briefly restate the interpreted question in 1 sentence.\n"
            "- Then explain clearly step-by-step using the context.\n"
            "- If a key detail is genuinely ambiguous, ask at most 1 short clarifying question at the end.\n"
            "- Be concise but actually helpful."
        )

        response = openai.ChatCompletion.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {
                    "role": "user",
                    "content": (
                        "Speech-to-text context (may contain errors):\n"
                        f"{request.prompt}\n\n"
                        f"Selected question: {request.question}"
                    ),
                },
            ],
            max_tokens=700,
            temperature=0.7,
        )

        text = response["choices"][0]["message"]["content"].strip()
        return ExplainResponseBody(explanation=text)

    except Exception as e:
        print(f"OpenAI Error: {e}")
        raise HTTPException(status_code=400, detail=f"Error: {str(e)}")


# =========================
# 3) FOLLOW-UPS (2)
# =========================
class FollowUpRequest(BaseModel):
    prompt: str        # original transcript / context (STT)
    question: str      # chosen question
    explanation: str   # model explanation shown


class FollowUpResponse(BaseModel):
    followups: list[str]  # exactly 2


@router.post("/get-followup-questions", response_model=FollowUpResponse)
async def get_followup_questions(req: FollowUpRequest):
    try:
        system_prompt = (
            "You are a tutor.\n"
            "IMPORTANT: The student's context came from speech-to-text and may contain transcription errors.\n"
            "Infer intent; don't mirror wrong terms.\n"
            "Generate exactly 2 strong follow-up questions that naturally come next.\n"
            "Rules:\n"
            "- Must be specific to the student's context + selected question + explanation.\n"
            "- One should deepen understanding (why/how/intuition).\n"
            "- One should be application/practice oriented (example, solve, check).\n"
            "- Keep each under 14 words.\n"
            "- Output ONLY two lines, no numbering, no bullets."
        )

        user_content = (
            "Speech-to-text context (may contain errors):\n"
            f"{req.prompt}\n\n"
            f"Selected question:\n{req.question}\n\n"
            f"Explanation shown:\n{req.explanation}\n\n"
            "Now generate 2 follow-up questions."
        )

        resp = openai.ChatCompletion.create(
            model="gpt-4.1-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ],
            max_tokens=120,
            temperature=0.8,
        )

        raw = resp["choices"][0]["message"]["content"].strip()
        lines = [ln.strip() for ln in raw.split("\n") if ln.strip()]
        followups = [ln.lstrip("0123456789.-) ").strip() for ln in lines][:2]

        if len(followups) < 2:
            followups = (followups + ["Can you give an example?", "How do I apply this?"])[:2]

        return FollowUpResponse(followups=followups)

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error: {str(e)}")
