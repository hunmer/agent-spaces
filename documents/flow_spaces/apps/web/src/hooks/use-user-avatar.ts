import { useEffect, useState } from "react";

let cachedUrl: string | null | undefined = undefined;

type Listener = (url: string | null) => void;
const listeners = new Set<Listener>();

export function setCachedUserAvatarUrl(url: string | null) {
  cachedUrl = url;
  listeners.forEach((l) => l(url));
}

export function useUserAvatar() {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    if (cachedUrl !== undefined) return cachedUrl;
    return null;
  });

  useEffect(() => {
    if (cachedUrl === undefined) {
      fetch("/api/user/settings")
        .then((r) => r.json())
        .then((data) => {
          if (data.avatarUrl) {
            cachedUrl = data.avatarUrl;
            setAvatarUrl(data.avatarUrl);
          }
        })
        .catch(() => {});
    }

    listeners.add(setAvatarUrl);
    return () => { listeners.delete(setAvatarUrl); };
  }, []);

  return avatarUrl;
}
