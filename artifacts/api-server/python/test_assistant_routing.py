import unittest
from types import SimpleNamespace
from unittest.mock import Mock, patch

import main


class AssistantRoutingTests(unittest.TestCase):
    def test_greetings_and_polite_closings_are_friendly(self):
        for message in ("Hi!", "Good morning", "How are you?", "Thanks", "Goodbye."):
            with self.subTest(message=message):
                self.assertEqual(main.classify_message(message), "greeting")
                self.assertTrue(main.greeting_answer(message))

    def test_general_non_sensitive_questions_use_general_answers(self):
        for message in (
            "What is the capital of Kenya?",
            "What are typical benefits of exercise?",
            "What is the average salary for employees in Kenya?",
            "How do I write a performance review?",
        ):
            with self.subTest(message=message):
                self.assertEqual(main.classify_message(message), "general")

    def test_employer_policy_questions_use_approved_sources(self):
        for message in (
            "What is our annual leave policy?",
            "How many sick leave days do I get?",
            "How do I apply for annual leave?",
        ):
            with self.subTest(message=message):
                self.assertEqual(main.classify_message(message), "policy")

    def test_human_requests_and_sensitive_topics_escalate(self):
        for message in (
            "I need to talk to a human.",
            "Can I get a real person?",
            "I need legal advice.",
            "I need medical advice about these symptoms.",
            "I want to file a formal grievance.",
        ):
            with self.subTest(message=message):
                self.assertEqual(main.classify_message(message), "escalated")

    def test_personal_employee_information_is_never_generalized(self):
        for message in (
            "What is my salary?",
            "What is another employee's salary?",
            "What is my colleague's work email?",
            "Is my leave approved?",
            "How much leave balance do I have?",
        ):
            with self.subTest(message=message):
                self.assertEqual(main.classify_message(message), "escalated")

    def test_general_ai_can_ask_one_clarifying_question(self):
        completion = SimpleNamespace(
            choices=[
                SimpleNamespace(
                    message=SimpleNamespace(
                        content='{"answer":"Which city should I use?","needsClarification":true}'
                    )
                )
            ]
        )
        client = SimpleNamespace(
            chat=SimpleNamespace(
                completions=SimpleNamespace(create=Mock(return_value=completion))
            )
        )
        with patch.object(main, "ai_client", client):
            self.assertEqual(
                main.general_answer("What is the weather like?"),
                ("Which city should I use?", True),
            )

    def test_unresolved_general_clarification_escalates_on_second_attempt(self):
        employee = {"id": "employee-1", "email": None}
        payload = main.ChatInput(message="Can you narrow that down?")
        first_connection = Mock()
        first_connection.__enter__ = Mock(return_value=first_connection)
        first_connection.__exit__ = Mock(return_value=False)

        with (
            patch.object(
                main,
                "ensure_conversation",
                return_value={"id": "conversation-1", "unresolved_count": 0},
            ),
            patch.object(main, "database", return_value=first_connection),
            patch.object(main, "general_answer", return_value=("Which topic?", True)),
        ):
            first = main.ask_hr_assistant(payload, employee)
        self.assertEqual(first["answerType"], "clarification")
        first_connection.execute.assert_called_once()

        with (
            patch.object(
                main,
                "ensure_conversation",
                return_value={"id": "conversation-1", "unresolved_count": 1},
            ),
            patch.object(
                main,
                "general_answer",
                return_value=("Which topic?", True),
            ),
            patch.object(
                main,
                "fallback_result",
                return_value={"answerType": "escalated", "escalated": True},
            ),
        ):
            second = main.ask_hr_assistant(payload, employee)
        self.assertEqual(second["answerType"], "escalated")


if __name__ == "__main__":
    unittest.main()
