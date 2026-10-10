import Pusher from 'pusher-js';

const API_URL = import.meta.env.VITE_API_URL || 'https://herkeslersoruyor.panalix.com.tr/api';

const readToken = () => {
    try { return localStorage.getItem('token') || ''; } catch { return ''; }
};

/**
 * Özel kanal yetkilendirmesi her seferinde TAZE token ile yapılır.
 *
 * Eskiden Authorization başlığı modül yüklenirken bir kez üretiliyordu: sayfa
 * giriş yapılmamışken açılıp sonra giriş yapıldıysa (ya da 401 sonrası yeniden
 * girildiyse) başlık boş/eski kalıyor, `private-user.{id}` aboneliği 401/403
 * alıyor ve alıcı `new-message` olayını hiç görmüyordu — "mesaj gitmiyor"
 * hissinin ana kaynağı buydu (mesaj sunucuda vardı, sohbet yenilenince çıkıyordu).
 */
export const pusher = new Pusher('5e3395e614923bc06ebe', {
    cluster: 'eu',
    forceTLS: true,
    channelAuthorization: {
        transport: 'ajax',
        endpoint: `${API_URL}/broadcasting/auth`,
        headersProvider: () => ({
            Authorization: `Bearer ${readToken()}`,
            Accept: 'application/json',
        }),
    },
});

/** @type {Map<string, { channel: import('pusher-js').Channel, listeners: Set<object>, boundHandlers: Record<string, Function>, retries: number, retryTimer: any }>} */
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

const MAX_RETRIES = 6;

/**
 * Abonelik reddedildiyse (token yok/eski) artan aralıkla yeniden dener.
 * Token hâlâ yoksa denemez; giriş yapılınca subscribeToUserChannel zaten
 * yeniden çağrılır ve o anda taze token ile yetkilenir.
 */
function scheduleResubscribe(channelName) {
    const entry = channelRegistry.get(channelName);
    if (!entry || entry.retryTimer || entry.retries >= MAX_RETRIES) return;
    const delay = Math.min(30000, 2000 * 2 ** entry.retries);
    entry.retries += 1;
    entry.retryTimer = setTimeout(() => {
        entry.retryTimer = null;
        if (!channelRegistry.has(channelName) || !readToken()) return;
        if (!entry.channel.subscribed && !entry.channel.subscriptionPending) {
            entry.channel.subscribe();
        }
    }, delay);
}

function ensureChannel(userId) {
    const channelName = `private-user.${userId}`;
    let entry = channelRegistry.get(channelName);
    if (entry) {
        // Daha önce yetkilendirme düşmüş olabilir: token artık varsa hemen yeniden dene.
        if (!entry.channel.subscribed && !entry.channel.subscriptionPending && readToken()) {
            entry.channel.subscribe();
        }
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

    entry = { channel, listeners, boundHandlers, retries: 0, retryTimer: null };

    boundHandlers['pusher:subscription_succeeded'] = () => { entry.retries = 0; };
    boundHandlers['pusher:subscription_error'] = (err) => {
        console.warn(`Pusher aboneliği reddedildi (${channelName}):`, err?.status || err?.error || err);
        scheduleResubscribe(channelName);
    };
    channel.bind('pusher:subscription_succeeded', boundHandlers['pusher:subscription_succeeded']);
    channel.bind('pusher:subscription_error', boundHandlers['pusher:subscription_error']);

    channelRegistry.set(channelName, entry);
    return entry;
}

function teardown(channelName, entry) {
    if (entry.retryTimer) clearTimeout(entry.retryTimer);
    Object.entries(entry.boundHandlers).forEach(([eventName, handler]) => {
        entry.channel.unbind(eventName, handler);
    });
    pusher.unsubscribe(channelName);
    channelRegistry.delete(channelName);
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
            teardown(channelName, entry);
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
    entry.listeners.clear();
    teardown(channelName, entry);
};

export default pusher;
