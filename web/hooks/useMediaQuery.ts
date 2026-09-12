import { useEffect, useState } from 'react';

export function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);

    useEffect(() => {
        const list = window.matchMedia(query);
        const handler = (event: MediaQueryListEvent) => setMatches(event.matches);
        setMatches(list.matches);
        list.addEventListener('change', handler);
        return () => list.removeEventListener('change', handler);
    }, [query]);

    return matches;
}
