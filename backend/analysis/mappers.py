from typing import Any, Dict, Optional
import json
import ast


def openai_mapper(response: Any) -> Dict[str, Optional[Any]]:
    """Map an OpenAI Chat Completion or batch line to canonical fields.

    Accepts either a dict (already parsed) or a raw string. Returns a dict with
    keys: analysed_review, input_tokens, output_tokens, total_tokens, analysis_output
    """
    parsed = response
    # If response is a string, try to parse JSON or Python literal inside it.
    if isinstance(response, str):
        s = response
        # Try JSON first
        try:
            parsed = json.loads(s)
        except Exception:
            parsed = None
            # Try to find first JSON object substring
            start = s.find("{")
            while start != -1:
                try:
                    candidate = s[start:]
                    parsed = json.loads(candidate)
                    break
                except Exception:
                    start = s.find("{", start + 1)
            # If still not parsed, try Python literal eval (handles single quotes)
            if parsed is None:
                try:
                    parsed = ast.literal_eval(s)
                except Exception:
                    parsed = None
                    # try to find first {...} python literal
                    start = s.find("{")
                    while start != -1:
                        try:
                            candidate = s[start:]
                            parsed = ast.literal_eval(candidate)
                            break
                        except Exception:
                            start = s.find("{", start + 1)
            if parsed is None:
                parsed = response

    analysed_review = None
    input_tokens = None
    output_tokens = None
    total_tokens = None

    # If parsed is a dict-like structure, attempt to extract usage and assistant content.
    def find_key(obj: Any, key: str):
        # recursive search for a key in nested dict/list structures
        if isinstance(obj, dict):
            if key in obj:
                return obj[key]
            for v in obj.values():
                res = find_key(v, key)
                if res is not None:
                    return res
        elif isinstance(obj, list):
            for item in obj:
                res = find_key(item, key)
                if res is not None:
                    return res
        return None

    if isinstance(parsed, dict):
        usage = find_key(parsed, "usage")
        if usage and isinstance(usage, dict):
            input_tokens = usage.get("prompt_tokens")
            # some providers use completion_tokens or output_tokens
            output_tokens = usage.get("completion_tokens") or usage.get("output_tokens")
            total_tokens = usage.get("total_tokens")

        choices = find_key(parsed, "choices")
        if choices and isinstance(choices, list) and len(choices) > 0:
            first = choices[0]
            if isinstance(first, dict):
                msg = first.get("message") or first.get("msg")
                if isinstance(msg, dict):
                    analysed_review = msg.get("content") or msg.get("text")
                else:
                    analysed_review = first.get("text") or first.get("content")
    # Fallback: if parsed is a string, use it as analysis output
    analysis_output = None
    try:
        analysis_output = parsed if isinstance(parsed, str) else json.dumps(parsed)
    except Exception:
        analysis_output = str(parsed)

    return {
        "analysed_review": analysed_review,
        "input_tokens": input_tokens,
        "output_tokens": output_tokens,
        "total_tokens": total_tokens,
        "analysis_output": analysis_output,
    }


def get_mapper_for_name(provider_name: str):
    if not provider_name:
        return None
    pn = provider_name.lower()
    if pn == "openai":
        return openai_mapper
    return None


