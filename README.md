# 👁️ A-eyes

### Where AI Meets Eyes

A-eyes is a multimodal AI-powered classroom assistant designed to empower students with diverse abilities to actively participate in learning environments.

Traditional assistive technologies focus on communication mechanics — but they do not understand lecture context, generate academic questions, or support real-time classroom learning. A-eyes bridges that gap by combining real-time lecture capture, AI-powered understanding, intelligent question generation, and eye-tracking selection in a web-based platform.

Instead of forcing students to adapt to technology, A-eyes adapts technology to students.

---

# 🚀 Key Features

- 🎙 Real-time lecture transcription (speech-to-text)
- 🧠 AI contextual understanding of lecture content
- 💡 AI-generated recommended questions (clarification + reinforcement)
- 👁 Eye-tracking question selection (hands-free interaction)
- 🔊 Text-to-speech output
- 🌐 Web-based, scalable platform
- 💸 Works with standard webcams (no expensive proprietary hardware required)

---

# 🧠 Why A-eyes?

Existing assistive tools (eye trackers, speech-generating devices, AAC boards):

- Are hardware-dependent
- Extremely expensive
- Closed proprietary ecosystems
- Not integrated into classroom workflows
- Not AI-powered

They allow users to select pre-programmed phrases.

But they do not understand context.  
They do not process lectures.  
They do not generate intelligent, real-time academic questions.

They assist communication.

But they do not assist learning.

A-eyes introduces a cloud-powered intelligence layer that connects to existing hardware and transforms it into something smarter — enabling real-time classroom participation through AI and gaze.

---

# 🛠 Installation & Running the Project

This project contains:

- **Frontend** (Vite)
- **Backend** (Python + FastAPI)

---

# 📦 FRONTEND SETUP (Vite)

## 1️⃣ Navigate to frontend directory

```bash
cd frontend
```


## 2️⃣ Install dependencies

```bash
npm i
```

## 3️⃣ Start the local server

```bash
npm run dev
```
By default, it will run at http://localhost:5173

🧩 BACKEND SETUP (Python + FastAPI)

## 1️⃣ Navigate to backend directory

```bash
cd backend
```

## 2️⃣ Create and install dependencies

```bash
virtualenv .venv
.venv\Scripts\activate
```

## 3️⃣ Install dependencies

```bash
pip install -r requirements.txt
```

## 4️⃣ Create a .env file with:   
```bash
OPENAI_API_KEY="<openai_key>"
```

## 5️⃣ Run the FastAPI server
```bash
uvicorn main:app --reload --port 8000
```


