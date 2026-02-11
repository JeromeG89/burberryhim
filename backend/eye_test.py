import cv2
import numpy as np
import mediapipe as mp
from collections import deque
import time

"""
2D Gaze Cursor + Button Selection (OpenCV demo)

What this does:
- Estimates a 2D gaze point (x,y) using iris landmarks.
- 5-point calibration: TL, TR, BL, BR, CENTER
- Draws a button grid; you "click" by holding gaze (dwell).

Controls:
  1 = Calibrate TOP-LEFT
  2 = Calibrate TOP-RIGHT
  3 = Calibrate BOTTOM-LEFT
  4 = Calibrate BOTTOM-RIGHT
  5 = Calibrate CENTER
  R = Reset calibration
  M = Toggle mirror (if cursor moves opposite)
  Q = Quit

Install:
  pip install opencv-python mediapipe numpy
"""

# =========================
# TUNING (stable defaults)
# =========================
SMOOTH_N = 7               # bigger = smoother, slower response (try 5-10)
CALIB_SECONDS = 1.0        # record for 1 sec per calibration point
DWELL_SECONDS = 1.0        # hold gaze for 1 sec to select
DWELL_FRAMES_MIN = 10      # also require at least N frames on same button
MAX_JITTER_PX = 55         # if gaze jumps too much, reset dwell

SHOW_DEBUG = True
FONT = cv2.FONT_HERSHEY_SIMPLEX

# =========================
# MediaPipe FaceMesh
# =========================
mp_face = mp.solutions.face_mesh
face_mesh = mp_face.FaceMesh(refine_landmarks=True, max_num_faces=1)

# Eye corners
LEFT_OUTER, LEFT_INNER = 33, 133
RIGHT_OUTER, RIGHT_INNER = 362, 263

# Iris points
LEFT_IRIS = [468, 469, 470, 471, 472]
RIGHT_IRIS = [473, 474, 475, 476, 477]

# Eyelids for vertical normalization
LEFT_TOP, LEFT_BOTTOM = 159, 145
RIGHT_TOP, RIGHT_BOTTOM = 386, 374


def iris_center(lm, idxs, w, h):
    pts = np.array([[lm[i].x * w, lm[i].y * h] for i in idxs], dtype=np.float32)
    return pts.mean(axis=0)


def norm_2d(iris, left_corner, right_corner, top_lid, bottom_lid):
    """
    Returns (u,v) each in 0..1 range inside the eye box.
    u: left->right, v: top->bottom.
    """
    u = (iris[0] - left_corner[0]) / (right_corner[0] - left_corner[0] + 1e-6)
    v = (iris[1] - top_lid[1]) / (bottom_lid[1] - top_lid[1] + 1e-6)
    return float(np.clip(u, 0.0, 1.0)), float(np.clip(v, 0.0, 1.0))


# =========================
# Calibration state
# =========================
# We store gaze-space points (u,v) for:
# TL, TR, BL, BR, C
cal = {"TL": None, "TR": None, "BL": None, "BR": None, "C": None}
sampling = None  # {target, values(list of (u,v)), end_time}
mirrored = False

u_hist = deque(maxlen=SMOOTH_N)
v_hist = deque(maxlen=SMOOTH_N)


def start_sampling(target):
    global sampling
    sampling = {"target": target, "values": [], "end_time": time.time() + CALIB_SECONDS}
    print(f"Sampling {target} for {CALIB_SECONDS}s... keep your gaze steady.")


def finish_sampling():
    global sampling, cal
    vals = sampling["values"]
    target = sampling["target"]
    sampling = None

    if len(vals) < 8:
        print(f"Not enough samples for {target}. Try again (make sure face is detected).")
        return

    mean_uv = np.mean(np.array(vals, dtype=np.float32), axis=0)
    cal[target] = (float(mean_uv[0]), float(mean_uv[1]))
    print(f"Calibrated {target}: u={cal[target][0]:.4f}, v={cal[target][1]:.4f}")


def calibrated():
    return all(cal[k] is not None for k in ("TL", "TR", "BL", "BR", "C"))


def reset_calibration():
    global cal, sampling, u_hist, v_hist, mirrored
    cal = {"TL": None, "TR": None, "BL": None, "BR": None, "C": None}
    sampling = None
    u_hist.clear()
    v_hist.clear()
    mirrored = False
    print("Calibration reset.")


def map_gaze_to_screen(u, v, W, H):
    """
    Simple bilinear-ish mapping using the 4 corners.
    We treat u,v in gaze-space and map to screen-space.
    Works decently after 4-corner calibration.
    """

    # Corner points in gaze-space
    (u_tl, v_tl) = cal["TL"]
    (u_tr, v_tr) = cal["TR"]
    (u_bl, v_bl) = cal["BL"]
    (u_br, v_br) = cal["BR"]

    # Estimate normalized x by comparing u between left and right edges
    # We interpolate "left edge u" and "right edge u" based on v position.
    # First, build a v-based blend factor t (0 top -> 1 bottom) in gaze-space:
    v_top = (v_tl + v_tr) / 2.0
    v_bot = (v_bl + v_br) / 2.0
    t = (v - v_top) / (v_bot - v_top + 1e-6)
    t = float(np.clip(t, 0.0, 1.0))

    u_left_edge = (1 - t) * u_tl + t * u_bl
    u_right_edge = (1 - t) * u_tr + t * u_br
    x_norm = (u - u_left_edge) / (u_right_edge - u_left_edge + 1e-6)

    # Estimate normalized y by comparing v between top and bottom edges
    u_left = (u_tl + u_bl) / 2.0
    u_right = (u_tr + u_br) / 2.0
    s = (u - u_left) / (u_right - u_left + 1e-6)
    s = float(np.clip(s, 0.0, 1.0))

    v_top_edge = (1 - s) * v_tl + s * v_tr
    v_bottom_edge = (1 - s) * v_bl + s * v_br
    y_norm = (v - v_top_edge) / (v_bottom_edge - v_top_edge + 1e-6)

    x_norm = float(np.clip(x_norm, 0.0, 1.0))
    y_norm = float(np.clip(y_norm, 0.0, 1.0))

    X = int(x_norm * (W - 1))
    Y = int(y_norm * (H - 1))
    return X, Y, x_norm, y_norm


# =========================
# Button grid UI
# =========================
BUTTONS = [
    ["YES", "NO", "MAYBE"],
    ["UP", "OK", "DOWN"],
    ["A", "B", "C"]
]

def draw_buttons(frame, gaze_xy=None):
    """
    Draw a 3x3 button grid.
    Returns list of button rects with labels: [(x1,y1,x2,y2,label), ...]
    """
    H, W = frame.shape[:2]
    margin = 40
    grid_w = W - 2 * margin
    grid_h = int(H * 0.35)
    top = H - grid_h - margin
    left = margin

    rows = len(BUTTONS)
    cols = len(BUTTONS[0])
    cell_w = grid_w // cols
    cell_h = grid_h // rows

    rects = []
    for r in range(rows):
        for c in range(cols):
            x1 = left + c * cell_w
            y1 = top + r * cell_h
            x2 = x1 + cell_w - 8
            y2 = y1 + cell_h - 8
            label = BUTTONS[r][c]
            rects.append((x1, y1, x2, y2, label))

    # Highlight if gaze is inside a rect
    highlighted = None
    if gaze_xy is not None:
        gx, gy = gaze_xy
        for (x1, y1, x2, y2, label) in rects:
            if x1 <= gx <= x2 and y1 <= gy <= y2:
                highlighted = (x1, y1, x2, y2, label)
                break

    # Draw
    for (x1, y1, x2, y2, label) in rects:
        color = (200, 200, 200)
        thickness = 2
        if highlighted is not None and label == highlighted[4]:
            color = (0, 255, 255)
            thickness = 4
        cv2.rectangle(frame, (x1, y1), (x2, y2), color, thickness)
        cv2.putText(frame, label, (x1 + 12, y1 + 40), FONT, 1.0, color, 2)

    return rects, (highlighted[4] if highlighted else None)


# =========================
# Dwell-to-select state
# =========================
dwell_label = None
dwell_start = None
dwell_frames = 0
last_gaze_xy = None


def update_dwell(current_label, gaze_xy):
    """
    Returns selected_label if dwell completed else None.
    """
    global dwell_label, dwell_start, dwell_frames, last_gaze_xy

    now = time.time()

    # If gaze isn't on any button, reset dwell
    if current_label is None or gaze_xy is None:
        dwell_label = None
        dwell_start = None
        dwell_frames = 0
        last_gaze_xy = None
        return None

    # Jitter check: if gaze jumped too much, reset (prevents accidental clicks)
    if last_gaze_xy is not None:
        dx = gaze_xy[0] - last_gaze_xy[0]
        dy = gaze_xy[1] - last_gaze_xy[1]
        if (dx * dx + dy * dy) ** 0.5 > MAX_JITTER_PX:
            dwell_label = None
            dwell_start = None
            dwell_frames = 0

    last_gaze_xy = gaze_xy

    # New target button
    if current_label != dwell_label:
        dwell_label = current_label
        dwell_start = now
        dwell_frames = 1
        return None

    # Same target button continues
    dwell_frames += 1
    if dwell_start is None:
        dwell_start = now

    if (now - dwell_start) >= DWELL_SECONDS and dwell_frames >= DWELL_FRAMES_MIN:
        selected = dwell_label
        # reset after selection so it doesn't spam
        dwell_label = None
        dwell_start = None
        dwell_frames = 0
        return selected

    return None


def draw_calib_status(frame):
    y = 30
    cv2.putText(frame, "Calib: 1=TL 2=TR 3=BL 4=BR 5=C  R=reset  M=mirror  Q=quit",
                (20, y), FONT, 0.6, (255, 255, 255), 2)
    y += 30
    s = " | ".join([f"{k}:{'OK' if cal[k] else '--'}" for k in ["TL", "TR", "BL", "BR", "C"]])
    cv2.putText(frame, s, (20, y), FONT, 0.6, (255, 255, 255), 2)


# =========================
# Camera
# =========================
cap = cv2.VideoCapture(0)
if not cap.isOpened():
    raise RuntimeError("Cannot open camera (close Zoom/Discord/Teams).")

cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
cap.set(cv2.CAP_PROP_FPS, 30)

print("=== 2D Gaze Cursor Demo ===")
print("Press 1/2/3/4/5 to calibrate TL/TR/BL/BR/C (hold gaze steady for 1s each).")
print("Press M to toggle mirror if cursor feels reversed.")
print("Press Q to quit.\n")

WINDOW_NAME = "2D Gaze Cursor (Calibrate 1-5)"

cv2.namedWindow(WINDOW_NAME, cv2.WINDOW_NORMAL)
cv2.setWindowProperty(
    WINDOW_NAME,
    cv2.WND_PROP_FULLSCREEN,
    cv2.WINDOW_FULLSCREEN
)


while True:
    ok, frame = cap.read()
    if not ok:
        continue

    H, W = frame.shape[:2]

    if mirrored:
        frame = cv2.flip(frame, 1)

    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    res = face_mesh.process(rgb)

    gaze_xy = None
    gaze_norm = None
    selected = None
    face_ok = False

    if res.multi_face_landmarks:
        face_ok = True
        lm = res.multi_face_landmarks[0].landmark

        # iris centers
        l_iris = iris_center(lm, LEFT_IRIS, W, H)
        r_iris = iris_center(lm, RIGHT_IRIS, W, H)

        # corners
        l_outer = np.array([lm[LEFT_OUTER].x * W, lm[LEFT_OUTER].y * H], dtype=np.float32)
        l_inner = np.array([lm[LEFT_INNER].x * W, lm[LEFT_INNER].y * H], dtype=np.float32)

        r_outer = np.array([lm[RIGHT_OUTER].x * W, lm[RIGHT_OUTER].y * H], dtype=np.float32)
        r_inner = np.array([lm[RIGHT_INNER].x * W, lm[RIGHT_INNER].y * H], dtype=np.float32)

        # eyelids
        l_top = np.array([lm[LEFT_TOP].x * W, lm[LEFT_TOP].y * H], dtype=np.float32)
        l_bot = np.array([lm[LEFT_BOTTOM].x * W, lm[LEFT_BOTTOM].y * H], dtype=np.float32)

        r_top = np.array([lm[RIGHT_TOP].x * W, lm[RIGHT_TOP].y * H], dtype=np.float32)
        r_bot = np.array([lm[RIGHT_BOTTOM].x * W, lm[RIGHT_BOTTOM].y * H], dtype=np.float32)

        # normalize per-eye to (u,v)
        lu, lv = norm_2d(l_iris, l_outer, l_inner, l_top, l_bot)

        # For right eye, ensure left_corner and right_corner are actually left->right on screen:
        # r_inner is closer to nose (left side of right eye), r_outer is outer (right side).
        ru, rv = norm_2d(r_iris, r_inner, r_outer, r_top, r_bot)

        u = (lu + ru) / 2.0
        v = (lv + rv) / 2.0

        # smooth (stable cursor)
        u_hist.append(u)
        v_hist.append(v)
        u_s = float(np.mean(u_hist))
        v_s = float(np.mean(v_hist))

        # calibration sampling
        if sampling is not None:
            sampling["values"].append((u_s, v_s))
            if time.time() >= sampling["end_time"]:
                finish_sampling()

        # map to screen if calibrated
        if calibrated():
            X, Y, xn, yn = map_gaze_to_screen(u_s, v_s, W, H)
            gaze_xy = (X, Y)
            gaze_norm = (xn, yn)

            # draw gaze dot
            cv2.circle(frame, (X, Y), 10, (0, 0, 255), -1)
            cv2.circle(frame, (X, Y), 18, (0, 0, 255), 2)

        # draw iris dots (debug)
        if SHOW_DEBUG:
            cv2.circle(frame, tuple(l_iris.astype(int)), 3, (0, 255, 0), -1)
            cv2.circle(frame, tuple(r_iris.astype(int)), 3, (0, 255, 0), -1)

    # UI: buttons + highlight
    rects, hovered = draw_buttons(frame, gaze_xy=gaze_xy)

    # Dwell selection
    selected = update_dwell(hovered, gaze_xy)

    # Overlay text
    draw_calib_status(frame)

    if not face_ok:
        cv2.putText(frame, "NO FACE DETECTED", (20, 90), FONT, 0.8, (0, 0, 255), 2)

    if sampling is not None:
        cv2.putText(frame, f"Sampling {sampling['target']}...", (20, 120), FONT, 0.8, (0, 255, 255), 2)

    if hovered is not None:
        # Show dwell progress
        if dwell_start is not None and dwell_label == hovered:
            progress = min(1.0, (time.time() - dwell_start) / DWELL_SECONDS)
        else:
            progress = 0.0
        cv2.putText(frame, f"Hover: {hovered}  Dwell: {int(progress*100)}%",
                    (20, 150), FONT, 0.75, (0, 255, 255), 2)

    if gaze_norm is not None and SHOW_DEBUG:
        cv2.putText(frame, f"gaze_norm x={gaze_norm[0]:.3f} y={gaze_norm[1]:.3f}",
                    (20, 180), FONT, 0.65, (255, 255, 0), 2)

    if selected is not None:
        cv2.putText(frame, f"SELECTED: {selected}", (20, 220), FONT, 1.0, (0, 255, 0), 3)
        print(f"[SELECTED] {selected}")

    cv2.imshow(WINDOW_NAME, frame)

    key = cv2.waitKey(1) & 0xFF
    if key in (ord('q'), ord('Q')):
        break

    if key in (ord('r'), ord('R')):
        reset_calibration()

    if key in (ord('m'), ord('M')):
        mirrored = not mirrored
        print(f"Mirror toggled: {mirrored}")

    # Calibration keys
    if key == ord('1'):
        start_sampling("TL")
    elif key == ord('2'):
        start_sampling("TR")
    elif key == ord('3'):
        start_sampling("BL")
    elif key == ord('4'):
        start_sampling("BR")
    elif key == ord('5'):
        start_sampling("C")

cap.release()
cv2.destroyAllWindows()
