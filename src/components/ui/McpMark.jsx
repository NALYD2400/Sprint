import mascot from '../../../assets/branding/sprint-mascot-transparent.webp';

/** Marque Sprint utilisée pour le bouton MCP et sa fenêtre de connexion. */
export default function McpMark({ large = false }) {
  return (
    <span className={large ? 'mcp-mark mcp-mark-lg' : 'mcp-mark'}>
      <img src={mascot} alt="" draggable="false" />
    </span>
  );
}
