export function getZipSkillEntries(paths: string[], zipName: string) {
  return paths
    .filter((path) => path.split('/').pop()?.toLowerCase() === 'skill.md')
    .map((path) => {
      const parts = path.split('/');
      const root = parts.slice(0, -1).join('/');
      return {
        name: root ? parts.at(-2)! : zipName,
        path,
        root,
        files: paths.filter((candidate) => candidate !== path && (!root || candidate.startsWith(`${root}/`))),
      };
    });
}
