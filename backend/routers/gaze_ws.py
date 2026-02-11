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
    ok = capture_calibration_point()
    # Return the current number of corners so the UI can advance
    from services.gaze_tracker import corners
    return {"ok": ok, "count": len(corners)}

@router.websocket("/ws")
async def gaze_ws(websocket: WebSocket):
    # ...
    payload = get_latest_gaze_snapshot()
    # Print this to your terminal to see if x/y are changing
    print(f"Gaze Status: Calibrated={payload['calibrated']}, X={payload['x']}, Y={payload['y']}")
    await websocket.send_json(payload)