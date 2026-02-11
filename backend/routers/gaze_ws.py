import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from services.gaze_tracker import (
    get_latest_gaze_snapshot,
    reset_calibration,
    capture_calibration_point
)

router = APIRouter(prefix="/gaze", tags=["gaze"])

@router.websocket("/ws")
async def gaze_ws(websocket: WebSocket):
    print("WS CONNECT ATTEMPT")   # add this
    await websocket.accept()
    print("WS ACCEPTED")          # add this
    interval = 1 / 30  # 30 FPS

    try:
        while True:
            payload = get_latest_gaze_snapshot()
            await websocket.send_json(payload)
            await asyncio.sleep(interval)
    except WebSocketDisconnect:
        return

@router.post("/calibrate/reset")
def calibrate_reset():
    reset_calibration()
    return {"ok": True}

@router.post("/calibrate/capture")
def calibrate_capture():
    """
    Call this 5 times from the frontend:
    TL, TR, BL, BR, CENTER (in that order)
    """
    ok = capture_calibration_point()
    return {"ok": ok}
