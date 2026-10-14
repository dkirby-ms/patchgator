import unittest
from types import SimpleNamespace
from unittest.mock import Mock

from patchgator_studio.foundry_agent import run_agent_turn


class FoundryAgentTests(unittest.TestCase):
    def test_runs_local_function_and_continues_hosted_response(self) -> None:
        first = SimpleNamespace(
            id="response-1",
            output=[
                SimpleNamespace(
                    type="function_call",
                    name="analyze_reference",
                    arguments="{}",
                    call_id="call-1",
                )
            ],
            output_text="",
        )
        final = SimpleNamespace(id="response-2", output=[], output_text="The sample has a strong fundamental.")
        openai_client = Mock()
        openai_client.responses.create.side_effect = [first, final]
        executed: list[str] = []

        response_text, response_id = run_agent_turn(
            openai_client,
            "Analyze the reference.",
            lambda name, args: executed.append(name) or {"rms": 0.2},
        )

        self.assertEqual(executed, ["analyze_reference"])
        self.assertEqual((response_text, response_id), (final.output_text, final.id))
        follow_up = openai_client.responses.create.call_args_list[1].kwargs
        self.assertEqual(follow_up["previous_response_id"], first.id)
        self.assertEqual(follow_up["input"][0].call_id, "call-1")

    def test_rejects_unknown_or_argument_bearing_local_calls(self) -> None:
        call = SimpleNamespace(
            type="function_call",
            name="match_sound",
            arguments='{"path":"C:\\\\private.wav"}',
            call_id="call-2",
        )
        openai_client = Mock()
        openai_client.responses.create.return_value = SimpleNamespace(
            id="response-3",
            output=[call],
            output_text="",
        )

        def reject_arguments(_name: str, arguments: dict[str, object]) -> dict[str, object]:
            if arguments:
                raise ValueError("match_sound does not accept arguments.")
            return {}

        with self.assertRaisesRegex(ValueError, "does not accept arguments"):
            run_agent_turn(openai_client, "Match it.", reject_arguments)


if __name__ == "__main__":
    unittest.main()
