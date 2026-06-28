from __future__ import annotations

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from anomaly.layers.layer_3_behavioral import classify_goal_type


def test_classify_intent_is_extract():
    assert classify_goal_type("Classify the user message into one of: billing, support, sales.") == "Extract"


def test_generate_reply_is_creative():
    assert classify_goal_type("Generate a friendly reply to the customer.") == "Creative"


def test_json_prompt_is_transform():
    assert classify_goal_type("Return valid JSON with keys name and age.") == "Transform"
