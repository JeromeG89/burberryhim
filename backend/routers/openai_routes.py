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
    response: str

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
