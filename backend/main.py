import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import openai
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import requests
import httpx
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

# Allow your local Vite dev server to call Python locally
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"ok": True}

class ResponseBody(BaseModel):
    response: str

class RequestBody(BaseModel):
    prompt: str
openai.api_key = os.getenv("OPENAI_API_KEY")

@app.post("/get-openai-response", response_model=ResponseBody)
async def get_openai_response(request: RequestBody):
    try:
        # Get the response from OpenAI API using the correct method `ChatCompletion.create`
        response = openai.ChatCompletion.create(
            model="gpt-4.1-mini",  # Specify GPT-4.1-mini model
            messages=[{"role": "user", "content": request.prompt}],
            max_tokens=1000
        )

        # Extract the text from the OpenAI response
        openai_response = response['choices'][0]['message']['content'].strip()

        # Return the response in structured format
        return ResponseBody(response=openai_response)

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error: {str(e)}")

# @app.get("/chattest")
# async def chattest():
#     async with httpx.AsyncClient() as client:
#         try:
#             response = await client.post(
#                 url="http://127.0.0.1:8000/get-openai-response",
#                 json={"prompt": "Tell me a Joke"}
#             )
#             if response.status_code == 200:
#                 print("Response from OpenAI:", response.json()["response"])
#                 return {"ok": True}
#             else:
#                 print(f"Error: {response.status_code} - {response.text}")
#                 return {"error": f"Error: {response.status_code} - {response.text}"}
#         except Exception as e:
#             print(f"Request failed: {str(e)}")
#             return {"error": f"Request failed: {str(e)}"}