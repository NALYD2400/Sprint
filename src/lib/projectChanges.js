export function isValidProjectPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 0 && port <= 65535;
}

export function applyProjectChange(projects, change) {
  const { type, projectId, serverId } = change;
  if (type === 'addProject') return [...projects, change.project];
  if (type === 'removeProject') return projects.filter(project => project.id !== projectId);

  return projects.map(project => {
    if (project.id !== projectId) return project;
    const { name, color, command, port, ramLimit } = change;
    if (type === 'editProject') return {
      ...project,
      name: name ?? project.name,
      color: color ?? project.color,
    };
    const servers = project.servers || [];
    if (type === 'addServer') return { ...project, servers: [...servers, change.server] };
    if (type === 'removeServer') return {
      ...project,
      servers: servers.filter(server => server.id !== serverId),
    };
    return {
      ...project,
      servers: servers.map(server => server.id === serverId ? {
        ...server,
        name: name ?? server.name,
        command: command ?? server.command,
        port: port ?? server.port,
        ramLimit: ramLimit === undefined ? server.ramLimit : ramLimit,
      } : server),
    };
  });
}
