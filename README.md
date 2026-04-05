# ICU Digital Twin Frontend

A minimal React + Tailwind frontend for an ICU digital twin dashboard that simulates infection spread and recommends antibiotics.

## Run locally

1. Install dependencies:

```bash
npm install
```

2. Start the frontend:

```bash
npm run dev
```

3. Make sure the backend API is running on `http://localhost:8000`.

## API endpoints used

- `GET /patients`
- `GET /stats`
- `GET /recommend/{id}`
- Optional: `GET /network`
