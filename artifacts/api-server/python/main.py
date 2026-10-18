from __future__ import annotations

import json
import os
import re
import uuid
from datetime import datetime
from typing import Annotated, Literal

from fastapi import Depends, FastAPI, Header, HTTPException
from openai import OpenAI
from pydantic import BaseModel, Field
from psycopg import connect
from psycopg.rows import dict_row


app = FastAPI(title="HR Service Desk Python API")

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
ai_client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None
FALLBACK = (
    "I do not have access to that specific information. "
    "Let me help you route this request to an HR officer."
)
ESCALATION_MESSAGE = (
    "I am routing this issue to the HR Services team. "
    "A representative will review your request and get back to you via the service request page."
)
STOP_WORDS = {
    "a", "about", "an", "and", "are", "can", "do", "does", "for", "from",
    "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "our",
    "please", "the", "to", "we", "what", "when", "where", "which", "who",
    "why", "with", "you", "your",
}
HUMAN_REQUEST = re.compile(
    r"\b(speak|talk|connect|transfer|escalate)\b.{0,36}\b("
    r"human|person|representative|hr officer|hr agent|someone|staff)\b"
    r"|\b(formal grievance|file a grievance|raise a grievance)\b",
    re.IGNORECASE,
)
SENSITIVE_TOPIC = re.compile(
    r"\b(legal|lawyer|attorney|medical|diagnosis|health condition|"
    r"harassment|discrimination|retaliation|abuse|formal grievance|"
    r"workplace dispute)\b",
    re.IGNORECASE,
)
PRIVATE_DATA = re.compile(
    r"\b(salary|compensation|performance review|employee id|national id|"
    r"home address|personal phone|bank account|date of birth)\b",
    re.IGNORECASE,
)
OTHER_PERSON = re.compile(
    r"\b(another employee|other employee|coworker|colleague|someone else|"
    r"another person|their salary|their performance|their address)\b",
    re.IGNORECASE,
)


class ChatInput(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    conversation_id: str | None = Field(default=None, alias="conversationId")

    model_config = {"populate_by_name": True}


class ServiceRequestInput(BaseModel):
    category: Literal["leave", "it", "payroll", "documents", "other"]
    title: str = Field(min_length=1, max_length=160)
    description: str = Field(min_length=1, max_length=4000)


class PolicyInput(BaseModel):
    title: str = Field(min_length=1, max_length=160)
    source_name: str = Field(min_length=1, max_length=200, alias="sourceName")
    content: str = Field(min_length=20, max_length=50000)

    model_config = {"populate_by_name": True}


class EscalationUpdate(BaseModel):
    status: Literal["reviewing", "resolved"]


def database():
    database_url = os.getenv("DATABASE_URL")
    if not database_url:
        raise HTTPException(status_code=503, detail="HR data storage is unavailable.")
    return connect(database_url, row_factory=dict_row)


def employee_context(
    employee_id: Annotated[str | None, Header(alias="X-Hr-Employee-Id")] = None,
    employee_email: Annotated[str | None, Header(alias="X-Hr-Employee-Email")] = None,
) -> dict[str, str | None]:
    # These headers are created by the authenticated Express gateway, never read
    # directly from the browser. The Python service only binds to loopback.
    if not employee_id:
        raise HTTPException(status_code=401, detail="Sign in to access HR services.")
    return {"id": employee_id, "email": employee_email}


Employee = Annotated[dict[str, str | None], Depends(employee_context)]


def is_hr_admin(employee: dict[str, str | None]) -> bool:
    configured = {
        item.strip().lower()
        for item in os.getenv("HR_ADMIN_EMAILS", "").split(",")
        if item.strip()
    }
    email = (employee.get("email") or "").lower()
    return bool(email and email in configured)


def require_hr_admin(employee: dict[str, str | None]) -> None:
    if not is_hr_admin(employee):
        raise HTTPException(status_code=403, detail="HR administrator access is required.")


def format_time(value: datetime) -> str:
    return value.isoformat()


def request_payload(row: dict) -> dict:
    status_labels = {
        "submitted": "Submitted for manager approval",
        "reviewing": "In human review",
        "resolved": "Resolved",
    }
    return {
        "id": row["id"],
        "category": row["category"],
        "title": row["title"],
        "description": row["description"],
        "status": status_labels.get(row["status"], row["status"]),
        "createdAt": format_time(row["created_at"]),
    }


def policy_payload(row: dict) -> dict:
    return {
        "id": row["id"],
        "title": row["title"],
        "sourceName": row["source_name"],
        "createdAt": format_time(row["created_at"]),
    }


def ensure_conversation(employee: dict[str, str | None], conversation_id: str | None) -> dict:
    with database() as conn:
        if conversation_id:
            conversation = conn.execute(
                """
                SELECT id, unresolved_count, escalated
                FROM hr_conversations
                WHERE id = %s AND employee_id = %s
                """,
                (conversation_id, employee["id"]),
            ).fetchone()
            if not conversation:
                raise HTTPException(status_code=404, detail="Conversation not found.")
            return conversation

        conversation = {
            "id": f"CONV-{uuid.uuid4().hex[:16].upper()}",
            "unresolved_count": 0,
            "escalated": False,
        }
        conn.execute(
            """
            INSERT INTO hr_conversations (id, employee_id, unresolved_count, escalated)
            VALUES (%s, %s, 0, FALSE)
            """,
            (conversation["id"], employee["id"]),
        )
        return conversation


def make_escalation(
    employee: dict[str, str | None],
    conversation_id: str,
    message: str,
) -> dict:
    with database() as conn:
        existing = conn.execute(
            """
            SELECT id, status FROM hr_escalations
            WHERE employee_id = %s AND conversation_id = %s AND status <> 'resolved'
            ORDER BY created_at DESC LIMIT 1
            """,
            (employee["id"], conversation_id),
        ).fetchone()
        if existing:
            escalation = existing
        else:
            escalation = {
                "id": f"HR-{uuid.uuid4().hex[:8].upper()}",
                "status": "open",
            }
            conn.execute(
                """
                INSERT INTO hr_escalations
                  (id, employee_id, employee_email, conversation_id, summary, status)
                VALUES (%s, %s, %s, %s, %s, 'open')
                """,
                (
                    escalation["id"],
                    employee["id"],
                    employee["email"],
                    conversation_id,
                    message[:4000],
                ),
            )
        conn.execute(
            """
            UPDATE hr_conversations SET escalated = TRUE, updated_at = NOW()
            WHERE id = %s AND employee_id = %s
            """,
            (conversation_id, employee["id"]),
        )
        return escalation


def fallback_result(
    employee: dict[str, str | None],
    conversation: dict,
    message: str,
) -> dict:
    escalation = make_escalation(employee, conversation["id"], message)
    return {
        "conversationId": conversation["id"],
        "answer": f"{FALLBACK}\n\n{ESCALATION_MESSAGE}",
        "citations": [],
        "escalated": True,
        "escalation": {"id": escalation["id"], "status": escalation["status"]},
    }


def terms(text: str) -> set[str]:
    return {
        word
        for word in re.findall(r"[a-z0-9']+", text.lower())
        if len(word) > 2 and word not in STOP_WORDS
    }


def find_relevant_policies(message: str) -> list[dict]:
    question_terms = terms(message)
    if not question_terms:
        return []

    with database() as conn:
        policies = conn.execute(
            """
            SELECT id, title, source_name, content
            FROM hr_policy_documents
            ORDER BY created_at DESC
            """
        ).fetchall()

    ranked = []
    for policy in policies:
        title_terms = terms(policy["title"])
        body_terms = terms(policy["content"])
        overlap = question_terms.intersection(title_terms | body_terms)
        if overlap:
            score = len(question_terms.intersection(body_terms))
            score += 2 * len(question_terms.intersection(title_terms))
            ranked.append((score, policy))
    ranked.sort(key=lambda item: item[0], reverse=True)
    return [policy for _, policy in ranked[:5]]


def grounded_answer(message: str, policies: list[dict]) -> tuple[str, list[dict]]:
    if not ai_client:
        raise RuntimeError("OpenAI API key is not configured.")

    source_material = [
        {
            "policyId": policy["id"],
            "title": policy["title"],
            "sourceName": policy["source_name"],
            "content": policy["content"],
        }
        for policy in policies
    ]
    response = ai_client.chat.completions.create(
        model=os.getenv("OPENAI_MODEL", "gpt-5-mini"),
        max_completion_tokens=8192,
        response_format={"type": "json_object"},
        messages=[
            {
                "role": "system",
                "content": (
                    "You are the employee HR policy assistant. Use ONLY the official policy "
                    "source text in the user's message. Never use prior knowledge, infer missing "
                    "rules, make up dates or employee data, or approve any request. Do not "
                    "disclose personal details about any employee. If the sources do not fully "
                    "answer the question, return the exact fallback sentence: "
                    f"{FALLBACK} Return only a JSON object with keys answer (string) and "
                    "citations (array of objects containing policyId and title). Cite every "
                    "policy used, using only IDs and titles supplied in the source material. "
                    "Be concise and professional."
                ),
            },
            {
                "role": "user",
                "content": json.dumps(
                    {"question": message, "approvedPolicySources": source_material},
                    ensure_ascii=False,
                ),
            },
        ],
    )
    raw = response.choices[0].message.content
    if not raw:
        raise ValueError("The AI response was empty.")
    data = json.loads(raw)
    answer = data.get("answer")
    cited = data.get("citations")
    allowed = {policy["id"]: policy for policy in policies}
    if not isinstance(answer, str) or not answer.strip() or not isinstance(cited, list):
        raise ValueError("The AI response did not match the expected format.")

    citations = []
    for citation in cited:
        if not isinstance(citation, dict) or citation.get("policyId") not in allowed:
            raise ValueError("The AI returned an invalid policy citation.")
        policy = allowed[citation["policyId"]]
        citations.append({"policyId": policy["id"], "title": policy["title"]})

    if answer.strip() == FALLBACK or not citations:
        raise ValueError("The policy sources did not provide a cited answer.")
    return answer.strip(), citations


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/hr/chat")
def ask_hr_assistant(payload: ChatInput, employee: Employee) -> dict:
    conversation = ensure_conversation(employee, payload.conversation_id)
    message = payload.message.strip()

    if HUMAN_REQUEST.search(message) or SENSITIVE_TOPIC.search(message):
        return fallback_result(employee, conversation, message)

    if PRIVATE_DATA.search(message) and OTHER_PERSON.search(message):
        return fallback_result(employee, conversation, message)

    if len(terms(message)) < 2:
        if conversation["unresolved_count"] >= 1:
            return fallback_result(employee, conversation, message)
        with database() as conn:
            conn.execute(
                """
                UPDATE hr_conversations
                SET unresolved_count = unresolved_count + 1, updated_at = NOW()
                WHERE id = %s AND employee_id = %s
                """,
                (conversation["id"], employee["id"]),
            )
        return {
            "conversationId": conversation["id"],
            "answer": (
                "Could you share a little more detail so I can check the right approved "
                "policy? Please avoid sending sensitive personal information here."
            ),
            "citations": [],
            "escalated": False,
            "escalation": None,
        }

    policies = find_relevant_policies(message)
    if not policies:
        return fallback_result(employee, conversation, message)

    try:
        answer, citations = grounded_answer(message, policies)
    except Exception:
        # If the provider is unavailable or the cited answer cannot be validated,
        # do not return an unverified completion.
        return fallback_result(employee, conversation, message)

    with database() as conn:
        conn.execute(
            """
            UPDATE hr_conversations
            SET unresolved_count = 0, updated_at = NOW()
            WHERE id = %s AND employee_id = %s
            """,
            (conversation["id"], employee["id"]),
        )
    return {
        "conversationId": conversation["id"],
        "answer": answer,
        "citations": citations,
        "escalated": False,
        "escalation": None,
    }


@app.get("/hr/requests")
def list_my_service_requests(employee: Employee) -> dict:
    with database() as conn:
        rows = conn.execute(
            """
            SELECT id, category, title, description, status, created_at
            FROM hr_service_requests
            WHERE employee_id = %s
            ORDER BY created_at DESC
            """,
            (employee["id"],),
        ).fetchall()
    return {"requests": [request_payload(row) for row in rows]}


@app.post("/hr/requests", status_code=201)
def create_service_request(payload: ServiceRequestInput, employee: Employee) -> dict:
    request_id = f"REQ-{uuid.uuid4().hex[:8].upper()}"
    with database() as conn:
        row = conn.execute(
            """
            INSERT INTO hr_service_requests
              (id, employee_id, employee_email, category, title, description, status)
            VALUES (%s, %s, %s, %s, %s, %s, 'submitted')
            RETURNING id, category, title, description, status, created_at
            """,
            (
                request_id,
                employee["id"],
                employee["email"],
                payload.category,
                payload.title.strip(),
                payload.description.strip(),
            ),
        ).fetchone()
    return request_payload(row)


@app.get("/hr/requests/{request_id}")
def get_my_service_request(request_id: str, employee: Employee) -> dict:
    with database() as conn:
        row = conn.execute(
            """
            SELECT id, category, title, description, status, created_at
            FROM hr_service_requests
            WHERE id = %s AND employee_id = %s
            """,
            (request_id, employee["id"]),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Request not found.")
    return request_payload(row)


@app.get("/hr/policies")
def list_approved_policies(employee: Employee) -> dict:
    with database() as conn:
        rows = conn.execute(
            """
            SELECT id, title, source_name, created_at
            FROM hr_policy_documents
            ORDER BY created_at DESC
            """
        ).fetchall()
    return {
        "policies": [policy_payload(row) for row in rows],
        "canManage": is_hr_admin(employee),
    }


@app.post("/hr/policies", status_code=201)
def create_approved_policy(payload: PolicyInput, employee: Employee) -> dict:
    require_hr_admin(employee)
    policy_id = f"POL-{uuid.uuid4().hex[:8].upper()}"
    with database() as conn:
        row = conn.execute(
            """
            INSERT INTO hr_policy_documents
              (id, title, source_name, content, uploaded_by)
            VALUES (%s, %s, %s, %s, %s)
            RETURNING id, title, source_name, created_at
            """,
            (
                policy_id,
                payload.title.strip(),
                payload.source_name.strip(),
                payload.content.strip(),
                employee["id"],
            ),
        ).fetchone()
    return policy_payload(row)


@app.delete("/hr/policies/{policy_id}", status_code=204)
def delete_approved_policy(policy_id: str, employee: Employee) -> None:
    require_hr_admin(employee)
    with database() as conn:
        result = conn.execute(
            "DELETE FROM hr_policy_documents WHERE id = %s",
            (policy_id,),
        )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Policy not found.")


@app.get("/hr/escalations")
def list_hr_escalations(employee: Employee) -> dict:
    require_hr_admin(employee)
    with database() as conn:
        escalations = conn.execute(
            """
            SELECT id, employee_email, summary, status, created_at
            FROM hr_escalations
            WHERE status <> 'resolved'
            """
        ).fetchall()
        requests = conn.execute(
            """
            SELECT id, employee_email, title, description, status, created_at
            FROM hr_service_requests
            WHERE status <> 'resolved'
            """
        ).fetchall()

    queue = [
        {
            "id": f"esc:{row['id']}",
            "employeeEmail": row["employee_email"],
            "summary": row["summary"],
            "status": row["status"],
            "createdAt": format_time(row["created_at"]),
        }
        for row in escalations
    ]
    queue.extend(
        {
            "id": f"req:{row['id']}",
            "employeeEmail": row["employee_email"],
            "summary": f"Service request: {row['title']}\n{row['description']}",
            "status": "open" if row["status"] == "submitted" else row["status"],
            "createdAt": format_time(row["created_at"]),
        }
        for row in requests
    )
    queue.sort(key=lambda item: item["createdAt"], reverse=True)
    return {"escalations": queue}


@app.patch("/hr/escalations/{item_id}")
def update_hr_escalation(
    item_id: str,
    payload: EscalationUpdate,
    employee: Employee,
) -> dict:
    require_hr_admin(employee)
    if item_id.startswith("req:"):
        table_id = item_id.removeprefix("req:")
        table = "hr_service_requests"
        source = "request"
    elif item_id.startswith("esc:"):
        table_id = item_id.removeprefix("esc:")
        table = "hr_escalations"
        source = "escalation"
    else:
        raise HTTPException(status_code=404, detail="Queue item not found.")

    with database() as conn:
        row = conn.execute(
            f"""
            UPDATE {table}
            SET status = %s, updated_at = NOW()
            WHERE id = %s
            RETURNING id, employee_email, status
            """,
            (payload.status, table_id),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Queue item not found.")

    if source == "request":
        with database() as conn:
            details = conn.execute(
                """
                SELECT title, description, created_at FROM hr_service_requests
                WHERE id = %s
                """,
                (table_id,),
            ).fetchone()
        summary = f"Service request: {details['title']}\n{details['description']}"
        item_id = f"req:{table_id}"
        created_at = details["created_at"]
    else:
        with database() as conn:
            details = conn.execute(
                """
                SELECT summary, created_at FROM hr_escalations WHERE id = %s
                """,
                (table_id,),
            ).fetchone()
        summary = details["summary"]
        item_id = f"esc:{table_id}"
        created_at = details["created_at"]

    return {
        "id": item_id,
        "employeeEmail": row["employee_email"],
        "summary": summary,
        "status": row["status"],
        "createdAt": format_time(created_at),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        app,
        host="127.0.0.1",
        port=int(os.getenv("HR_PYTHON_PORT", "5001")),
        access_log=False,
        log_level="warning",
    )
