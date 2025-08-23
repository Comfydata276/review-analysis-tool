from typing import List, Dict, Any, Optional


class BaseProvider:
    name: str = "base"

    def analyze_batch(self, inputs: List[str], prompt: str, model: str, reasoning: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        raise NotImplementedError()

    def analyze_single(self, full_prompt: str, model: str, reasoning: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        raise NotImplementedError()


