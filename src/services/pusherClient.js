import Pusher from 'pusher-js';

export const pusher = new Pusher('5e3395e614923bc06ebe', {
    cluster: 'eu',
    forceTLS: true,
    authEndpoint: `${import.meta.env.VITE_API_URL || 'https://herkeslersoruyor.panalix.com.tr/api'}/broadcasting/auth`,
    auth: {
        headers: {
            Authorization: `Bearer ${localStorage.getItem('token') || ''}`,
            Accept: 'application/json',
        },
    },
});

/** @type {Map<string, { channel: import('pusher-js').Channel, listeners: Set<object>, boundHandlers: Record<string, Function> }>} */
const channelRegistry = new Map();

const EVENT_MAP = {
    onNewMessage: 'new-message',
    onMessageAck: 'message-ack',
    onMessagesRead: 'messages-read',
    onUserTyping: 'user-typing',
    onMessageUpdated: 'message-updated',
    onMessageDeleted: 'message-deleted',
    onMessageReaction: 'message-reaction',
    onEphemeralModeUpdated: 'ephemeral-mode-updated',
    onScreenshotTaken: 'screenshot-taken',
    onNotification: 'notification',
};

function ensureChannel(userId) {
    const channelName = `private-user.${userId}`;
    let entry = channelRegistry.get(channelName);
    if (entry) {
        return entry;
    }

    const channel = pusher.subscribe(channelName);
    const listeners = new Set();
    const boundHandlers = {};

    Object.entries(EVENT_MAP).forEach(([callbackKey, eventName]) => {
        const handler = (data) => {
            listeners.forEach((callbacks) => {
                const cb = callbacks?.[callbackKey];
                if (typeof cb === 'function') {
                    try {
                        cb(data);
                    } catch (err) {
                        console.error(`Pusher ${eventName} listener error:`, err);
                    }
                }
            });
        };
        boundHandlers[eventName] = handler;
        channel.bind(eventName, handler);
    });

    entry = { channel, listeners, boundHandlers };
    channelRegistry.set(channelName, entry);
    return entry;
}

/**
 * Subscribe to private-user channel. Multiple callers can subscribe safely.
 * Returns an unsubscribe function for THIS listener only (does not kill other subscribers).
 */
export const subscribeToUserChannel = (userId, callbacks = {}) => {
    if (!userId) {
        return () => {};
    }

    const channelName = `private-user.${userId}`;
    const entry = ensureChannel(userId);
    entry.listeners.add(callbacks);

    return () => {
        entry.listeners.delete(callbacks);
        if (entry.listeners.size === 0) {
            Object.entries(entry.boundHandlers).forEach(([eventName, handler]) => {
                entry.channel.unbind(eventName, handler);
            });
            pusher.unsubscribe(channelName);
            channelRegistry.delete(channelName);
        }
    };
};

/** @deprecated Prefer the function returned by subscribeToUserChannel */
export const unsubscribeFromChannel = (userId) => {
    const channelName = `private-user.${userId}`;
    const entry = channelRegistry.get(channelName);
    if (!entry) {
        pusher.unsubscribe(channelName);
        return;
    }
    Object.entries(entry.boundHandlers).forEach(([eventName, handler]) => {
        entry.channel.unbind(eventName, handler);
    });
    entry.listeners.clear();
    pusher.unsubscribe(channelName);
    channelRegistry.delete(channelName);
};

export default pusher;
