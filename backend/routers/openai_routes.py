import os
from dotenv import load_dotenv
from pydantic import BaseModel
from fastapi import APIRouter, HTTPException

import openai

load_dotenv()
openai.api_key = os.getenv("OPENAI_API_KEY")

router = APIRouter(tags=["openai"])

class RequestBody(BaseModel):
    prompt: str

class ResponseBody(BaseModel):
    # Change 'response: str' to this:
    questions: list[str]

@router.post("/get-openai-response", response_model=ResponseBody)
async def get_openai_response(request: RequestBody):
    try:
        response = openai.ChatCompletion.create(
            model="gpt-4.1-mini",
            messages=[{"role": "user", "content": request.prompt}],
            max_tokens=1000,
        )
        text = response["choices"][0]["message"]["content"]
        return ResponseBody(response=text.strip())
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error: {str(e)}")

@router.post("/get-educational-questions", response_model=ResponseBody)
async def get_educational_questions(request: RequestBody):
    try:
        system_prompt = (
            "You are an educational assistant. Analyze the provided text and generate "
            "exactly 6 short, distinct, and helpful questions a student might ask. "
            "Return only the questions."
        )

        response = openai.ChatCompletion.create(
            model="gpt-4o", 
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Text: {request.prompt}"}
            ],
            max_tokens=500,
        )
        
        raw_text = response["choices"][0]["message"]["content"]
        lines = raw_text.strip().split('\n')
        
        # Clean up numbers and bullets
        questions = [line.lstrip('0123456789. ').strip() for line in lines if line.strip()]
        
        # 2. This now correctly validates against the updated ResponseBody
        return ResponseBody(questions=questions[:6])
        
    except Exception as e:
        print(f"OpenAI Error: {e}")
        raise HTTPException(status_code=400, detail=f"Error: {str(e)}")