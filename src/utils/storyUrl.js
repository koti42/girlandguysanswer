export const UUID_REGEX = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const slugify = (input) => {
    if (!input) return 'yazi';
    return String(input)
        .toLowerCase()
        // Turkish chars
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ı/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        // Remove HTML if any
        .replace(/<[^>]*>/g, ' ')
        // Non-word to hyphen
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .replace(/-+/g, '-')
        .slice(0, 80) || 'yazi';
};

export const buildOpinionPath = (opinion) => {
    const id = opinion?.id;
    const title = opinion?.title;
    const slug = opinion?.slug;
    if (!id) return '/opinions';
    if (slug && typeof slug === 'string' && slug.trim().length > 0) {
        return `/opinion/${slug.trim()}`;
    }
    const s = slugify(title);
    return `/opinion/${s}-${id}`;
};

export const extractOpinionId = (slugOrId) => {
    if (!slugOrId) return slugOrId;
    const match = String(slugOrId).match(UUID_REGEX);
    return match ? match[0] : slugOrId;
};

