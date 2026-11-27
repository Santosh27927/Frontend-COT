"use client";

import { useState } from "react";
import type { EconomyState } from "@/api/economy-types";
import type { useLessonCommands } from "@/features/trading/useLessonCommands";

export default function QuestionHub({
  questions,
  manualActionsAllowed,
  delivery,
}: {
  questions: EconomyState["questions"];
  manualActionsAllowed: boolean;
  delivery: ReturnType<typeof useLessonCommands>;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [answer, setAnswer] = useState("");
  const selected = questions.find((question) => question.id === selectedId);
  const blocked = delivery.blocked || !manualActionsAllowed;
  return (
    <section
      className="economy-panel question-hub"
      aria-labelledby="question-hub-heading"
    >
      <div className="section-heading">
        <div>
          <span className="eyebrow">Reflect on your lessons</span>
          <h2 id="question-hub-heading">Knowledge checks</h2>
        </div>
        <span className="status-pill">Optional</span>
      </div>
      <p className="muted">
        Each lesson opens its question after all three scenarios. These checks
        never block your trading progress.
      </p>
      {!manualActionsAllowed && (
        <p className="notice">
          Finish the active demonstration before answering.
        </p>
      )}
      <div className="question-list" aria-label="Choose a knowledge check">
        {questions.map((question, index) => (
          <button
            key={question.id}
            disabled={!question.unlocked || blocked}
            aria-pressed={selectedId === question.id}
            onClick={() => {
              setSelectedId(question.id);
              setAnswer("");
            }}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <span>{question.lessonId.replaceAll("-", " ")}</span>
            <span className="secondary-text">
              {question.paid
                ? "Completed"
                : question.unlocked
                  ? "Available"
                  : "Locked"}
            </span>
          </button>
        ))}
      </div>
      {selected ? (
        <form
          className="question-card"
          onSubmit={(event) => {
            event.preventDefault();
            if (!selected.unlocked || selected.paid || !answer || blocked)
              return;
            void delivery.send({
              action: "answer",
              questionId: selected.id,
              questionRevision: selected.revision,
              answer,
            });
          }}
        >
          <fieldset disabled={blocked || !selected.unlocked || selected.paid}>
            <legend>{selected.prompt}</legend>
            {selected.options.map((option) => (
              <label className="answer-option" key={option.id}>
                <input
                  type="radio"
                  name={`answer-${selected.id}`}
                  value={option.id}
                  checked={answer === option.id}
                  onChange={() => setAnswer(option.id)}
                />
                <span>
                  <strong>{option.id}.</strong> {option.text}
                </span>
              </label>
            ))}
            {!selected.paid && (
              <button className="primary" disabled={!answer}>
                Check answer
              </button>
            )}
          </fieldset>
          <p className="field-help">
            Accepted attempts: {selected.attempts}. Wrong answers are free to
            retry.
          </p>
          {selected.result && (
            <div
              className={`answer-feedback ${selected.result.correct ? "answer-correct" : ""}`}
              role="status"
            >
              <h3>
                {selected.result.correct ? "Correct" : "Review and try again"}
              </h3>
              <p className="correct-answer">
                <strong>Correct answer: {selected.result.correctAnswer}</strong>
              </p>
              <div className="answer-explanation">
                <h4>Explanation</h4>
                <p>{selected.result.explanation}</p>
              </div>
              <p>
                Reward: {selected.result.reward} Demo USD
                {selected.paid
                  ? " · paid once, including any pending credit"
                  : ""}
                .
              </p>
            </div>
          )}
        </form>
      ) : (
        <p className="empty-state">
          Choose an available question to review what you learned.
        </p>
      )}
    </section>
  );
}
