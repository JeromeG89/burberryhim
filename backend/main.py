from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from routers.gaze_ws import router as gaze_router
from routers.openai_routes import router as openai_router
from services.gaze_tracker import start_gaze_thread

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # tighten later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
def health():
    return {"ok": True}

# Routers
app.include_router(gaze_router)
app.include_router(openai_router)

@app.on_event("startup")
def _startup():
    start_gaze_thread()
