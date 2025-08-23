from typing import List, Dict, Any, Optional
import io
import time
import json
import requests

from .providers import BaseProvider


class OpenAIProvider(BaseProvider):
    """OpenAI provider using the Batch API for efficient batch processing.

    Behavior:
    - Builds a JSONL file where each line is the request body for `/v1/chat/completions`.
    - Uploads the file with purpose 'batch', creates a batch, polls until completion,
      downloads the output file and returns parsed results.
    - Falls back to single requests if batch creation fails.
    """

    name = "openai"

    def __init__(self, api_key: str):
        self.api_key = api_key

    def _headers(self) -> Dict[str, str]:
        return {"Authorization": f"Bearer {self.api_key}"}

    def analyze_batch(self, inputs: List[str], prompt: str, model: str, reasoning: Optional[Dict[str, Any]] = None, completion_window: str = "24h") -> List[Dict[str, Any]]:
        # Build JSONL content: each line is a JSON object representing the request body
        lines = []
        for inp in inputs:
            full_prompt = f"{prompt}\n\nReview:\n{inp}"
            # For Chat Completions endpoint use `reasoning_effort` (string) if provided.
            body: Dict[str, Any] = {"model": model, "messages": [{"role": "user", "content": full_prompt}]}
            if reasoning:
                # reasoning may be an object like {"effort": "low|medium|high"}
                effort = None
                try:
                    if isinstance(reasoning, dict):
                        effort = reasoning.get("effort")
                except Exception:
                    effort = None
                if effort:
                    # Chat completions expects `reasoning_effort` top-level string
                    body["reasoning_effort"] = effort
            lines.append(json.dumps(body))

        jsonl = "\n".join(lines).encode("utf-8")

        # Upload file with purpose 'batch'
        files = {"file": ("requests.jsonl", io.BytesIO(jsonl), "application/jsonl")}
        data = {"purpose": "batch"}
        resp = requests.post("https://api.openai.com/v1/files", headers=self._headers(), files=files, data=data)
        if not resp.ok:
            # fallback to per-item requests
            return [self.analyze_single(f"{prompt}\n\nReview:\n{inp}", model, reasoning) for inp in inputs]

        file_obj = resp.json()
        input_file_id = file_obj.get("id")
        if not input_file_id:
            return [self.analyze_single(f"{prompt}\n\nReview:\n{inp}", model, reasoning) for inp in inputs]

        # Create batch
        batch_payload = {"input_file_id": input_file_id, "endpoint": "/v1/chat/completions", "completion_window": completion_window}
        r2 = requests.post("https://api.openai.com/v1/batches", headers={**self._headers(), "Content-Type": "application/json"}, json=batch_payload)
        if not r2.ok:
            return [self.analyze_single(f"{prompt}\n\nReview:\n{inp}", model, reasoning) for inp in inputs]

        batch_obj = r2.json()
        batch_id = batch_obj.get("id")

        # Poll batch status
        deadline = time.time() + 60 * 10  # 10 minutes
        final_batch = batch_obj
        while time.time() < deadline:
            time.sleep(3)
            rb = requests.get(f"https://api.openai.com/v1/batches/{batch_id}", headers=self._headers())
            if not rb.ok:
                break
            final_batch = rb.json()
            status = final_batch.get("status")
            if status in ("completed", "failed", "cancelled"):
                break

        status = final_batch.get("status")
        if status != "completed":
            # attempt to cancel or return errors; fallback to single
            return [self.analyze_single(f"{prompt}\n\nReview:\n{inp}", model, reasoning) for inp in inputs]

        output_file_id = final_batch.get("output_file_id")
        if not output_file_id:
            return [self.analyze_single(f"{prompt}\n\nReview:\n{inp}", model, reasoning) for inp in inputs]

        # Download output file content
        rf = requests.get(f"https://api.openai.com/v1/files/{output_file_id}/content", headers=self._headers())
        if not rf.ok:
            return [self.analyze_single(f"{prompt}\n\nReview:\n{inp}", model, reasoning) for inp in inputs]

        content = rf.text
        results: List[Dict[str, Any]] = []
        for line in content.splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                results.append(json.loads(line))
            except Exception:
                results.append({"raw": line})

        return results

    def analyze_single(self, full_prompt: str, model: str, reasoning: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        # For single requests using Chat Completions, set `reasoning_effort` if present.
        body: Dict[str, Any] = {"model": model, "messages": [{"role": "user", "content": full_prompt}]}
        if reasoning:
            try:
                if isinstance(reasoning, dict):
                    effort = reasoning.get("effort")
                else:
                    effort = None
            except Exception:
                effort = None
            if effort:
                body["reasoning_effort"] = effort
        try:
            r = requests.post("https://api.openai.com/v1/chat/completions", headers={**self._headers(), "Content-Type": "application/json"}, json=body)
            return r.json()
        except Exception as e:
            return {"error": str(e)}


