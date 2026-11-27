"use client";
import type { GeneratorView } from "@/api/market-types";
import type { useLessonCommands } from "@/features/trading/useLessonCommands";
export default function GeneratorPanel({
  generators,
  delivery,
}: {
  generators: GeneratorView[];
  delivery: ReturnType<typeof useLessonCommands>;
}) {
  return (
    <div className="generator-grid">
      {generators.map((g) => (
        <section
          className="generator"
          key={g.asset}
          aria-label={`${g.asset} generator`}
        >
          <span className="asset-mark" aria-hidden="true">
            {g.asset.slice(0, 1)}
          </span>
          <h3>{g.asset} generator</h3>
          <p>{g.status}</p>
          {g.ratePerHour && (
            <p>
              {g.ratePerHour} {g.asset}/hour · storage {g.capacity} {g.asset}
            </p>
          )}
          {g.earned && g.productionAvailable && (
            <>
              <p>
                Stored:{" "}
                <strong>
                  {g.stored} {g.asset}
                </strong>
              </p>
              <button
                className="primary"
                disabled={delivery.blocked || !g.canCollect}
                onClick={() =>
                  void delivery.send({ action: "collect", asset: g.asset })
                }
              >
                Collect {g.asset}
              </button>
            </>
          )}
          {!g.earned && (
            <span className="locked-label">
              Complete its three lesson scenarios to earn it.
            </span>
          )}
          {g.earned && !g.productionAvailable && (
            <span className="locked-label">
              Earned · production settings pending
            </span>
          )}
        </section>
      ))}
    </div>
  );
}
