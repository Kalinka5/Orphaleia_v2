"""Public contracts for the anonymous, transcript-driven Book Oracle."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StrictBool

OracleAnswer = Literal["yes", "no", "probably", "probably-not", "unknown"]


class OracleAnswerEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["answer"]
    question_id: str = Field(min_length=1, max_length=100)
    answer: OracleAnswer


class OracleGuessEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")
    type: Literal["guess"]
    book_id: str = Field(min_length=1, max_length=100)
    correct: StrictBool


OracleEvent = Annotated[OracleAnswerEvent | OracleGuessEvent, Field(discriminator="type")]


class OracleStepInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    version: str = Field(min_length=1, max_length=32)
    # 120 unique questions plus three guesses. This bounds replay work, not round length.
    events: list[OracleEvent] = Field(default_factory=list, max_length=123)


class OracleChoice(BaseModel):
    id: OracleAnswer
    label: str


class OracleManifest(BaseModel):
    version: str
    title: str
    introduction: str
    library_size: int
    choices: list[OracleChoice]


class OracleQuestion(BaseModel):
    id: str
    prompt: str


class OracleBook(BaseModel):
    id: str
    title: str
    author: str
    explanation: str
    shop_slug: str | None = None


class OracleStateBase(BaseModel):
    version: str
    question_count: int
    guess_count: int


class OracleQuestionState(OracleStateBase):
    status: Literal["question"] = "question"
    question: OracleQuestion


class OracleGuessState(OracleStateBase):
    status: Literal["guess"] = "guess"
    book: OracleBook


class OracleSuccessState(OracleStateBase):
    status: Literal["success"] = "success"
    book: OracleBook


class OracleDefeatState(OracleStateBase):
    status: Literal["defeat"] = "defeat"
    message: str


OracleState = Annotated[OracleQuestionState | OracleGuessState | OracleSuccessState | OracleDefeatState, Field(discriminator="status")]
