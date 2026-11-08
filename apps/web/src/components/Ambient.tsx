/**
 * The room behind the page: the ledger ruling on its edges and two corner lights, fixed to the viewport and still.
 * Nothing here moves with the scroll or the pointer; the hero's engraved plate is the page's one moving ground.
 */
export function Ambient() {
  return (
    <div className="ambient" aria-hidden="true">
      <div className="amb-grid" />
      <div className="amb-glow amb-a" />
      <div className="amb-glow amb-b" />
    </div>
  );
}
