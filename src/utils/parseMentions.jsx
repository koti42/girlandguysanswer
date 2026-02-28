import React from 'react';
import { Link } from 'react-router-dom';

const MENTION_REGEX = /@([\p{L}\p{N}_]+)/gu;

export function processHtmlWithMentions(html) {
    if (!html || typeof html !== 'string') return html;
    return html.replace(MENTION_REGEX, (match, username) =>
        `<a href="/profile/${username}" class="mention-link">${match}</a>`
    );
}

export function textWithMentions(text, className = '') {
    if (!text || typeof text !== 'string') return null;
    const parts = [];
    let lastIndex = 0;
    let match;
    const re = new RegExp(MENTION_REGEX.source, 'gu');
    while ((match = re.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(
                <span key={`t-${lastIndex}`}>{text.slice(lastIndex, match.index)}</span>
            );
        }
        parts.push(
            <Link
                key={`m-${match.index}`}
                to={`/profile/${match[1]}`}
                className={`mention-link font-semibold text-coral hover:text-coral-dark hover:underline ${className}`}
            >
                {match[0]}
            </Link>
        );
        lastIndex = match.index + match[0].length;
    }
    if (lastIndex < text.length) {
        parts.push(<span key={`t-${lastIndex}`}>{text.slice(lastIndex)}</span>);
    }
    return parts.length > 0 ? parts : text;
}
