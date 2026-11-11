/** Фон: три капли акцентного цвета. Движение и форма — в CSS (app.css, блок «Лава»). */
export function Lava() {
  return (
    <div className="lava" aria-hidden="true">
      <div className="blob blob-a" />
      <div className="blob blob-b" />
      <div className="blob blob-c" />
    </div>
  )
}
