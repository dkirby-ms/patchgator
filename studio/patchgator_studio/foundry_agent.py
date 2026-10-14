from __future__ import annotations

import json
from collections.abc import Callable
from typing import Any


AGENT_INSTRUCTIONS = """You are PatchGator's sound-matching agent.
Help the user approximate an isolated reference sound on their Novation Summit or UltraNova.
The studio worker runs on the user's computer. Audio capture, MIDI and candidate search are local;
do not claim to hear or inspect raw audio. Start by calling analyze_reference when useful.
If no reference is selected and the user asks you to listen to a live sound, call record_reference first.
The local worker will ask for a separate RECORD confirmation before opening the audio input.
Only numerical audio features and the final parameter recipe are returned to you; never request
audio uploads, credentials, file paths, MIDI port names, or device configuration.
Call match_sound only after the user clearly asks to run a hardware match. The local worker will
show a confirmation prompt before sending MIDI. Do not imply that a recipe is a native preset.
The supported search is intentionally limited to five registered controls and coarse 0..127
steps. Explain limitations and report the local score as a relative comparison, not a guarantee
of perceptual similarity. Never recommend sending unimplemented MIDI messages or unsupported
parameters."""

_EMPTY_OBJECT_SCHEMA = {
    "type": "object",
    "properties": {},
    "required": [],
    "additionalProperties": False,
}

TOOL_DEFINITIONS = (
    {
        "name": "record_reference",
        "description": "Record one bounded reference clip from the explicitly configured local interface input. The local worker requires a separate interactive RECORD confirmation before opening the input.",
        "parameters": _EMPTY_OBJECT_SCHEMA,
    },
    {
        "name": "analyze_reference",
        "description": "Analyze the locally selected reference WAV. Returns numerical features only; does not access MIDI or record hardware.",
        "parameters": _EMPTY_OBJECT_SCHEMA,
    },
    {
        "name": "match_sound",
        "description": "Run the bounded local sound-matching search on the configured synth. The studio worker requires a separate interactive MATCH confirmation before any MIDI or audio capture.",
        "parameters": _EMPTY_OBJECT_SCHEMA,
    },
)


def _function_tools() -> list[Any]:
    from azure.ai.projects.models import FunctionTool

    return [
        FunctionTool(
            name=definition["name"],
            description=definition["description"],
            parameters=definition["parameters"],
            strict=True,
        )
        for definition in TOOL_DEFINITIONS
    ]


def create_foundry_agent(endpoint: str, model_name: str, agent_name: str) -> dict[str, str]:
    from azure.ai.projects import AIProjectClient
    from azure.ai.projects.models import PromptAgentDefinition
    from azure.identity import DefaultAzureCredential

    with (
        DefaultAzureCredential() as credential,
        AIProjectClient(endpoint=endpoint, credential=credential) as project_client,
    ):
        agent = project_client.agents.create_version(
            agent_name=agent_name,
            definition=PromptAgentDefinition(
                model=model_name,
                instructions=AGENT_INSTRUCTIONS,
                tools=_function_tools(),
            ),
        )
    return {"name": agent.name, "version": str(agent.version), "id": agent.id}


def run_agent_turn(
    openai_client: Any,
    prompt: str,
    execute_tool: Callable[[str, dict[str, Any]], dict[str, Any]],
    *,
    previous_response_id: str | None = None,
    max_tool_rounds: int = 8,
) -> tuple[str, str]:
    from openai.types.responses.response_input_param import FunctionCallOutput

    initial_request: dict[str, Any] = {"input": prompt}
    if previous_response_id:
        initial_request["previous_response_id"] = previous_response_id
    response = openai_client.responses.create(**initial_request)
    for _ in range(max_tool_rounds):
        calls = [item for item in response.output if item.type == "function_call"]
        if not calls:
            return response.output_text, response.id

        outputs = []
        for call in calls:
            arguments = json.loads(call.arguments)
            if not isinstance(arguments, dict):
                raise ValueError(f"Function arguments for {call.name} must be a JSON object.")
            result = execute_tool(call.name, arguments)
            outputs.append(
                FunctionCallOutput(
                    type="function_call_output",
                    call_id=call.call_id,
                    output=json.dumps(result),
                )
            )
        response = openai_client.responses.create(
            input=outputs,
            previous_response_id=response.id,
        )
    if any(item.type == "function_call" for item in response.output):
        raise RuntimeError(f"Foundry agent exceeded the {max_tool_rounds}-round local tool limit.")
    return response.output_text, response.id
