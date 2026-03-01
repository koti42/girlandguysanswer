import Pusher from 'pusher-js';

export const pusher = new Pusher('5e3395e614923bc06ebe', {
    cluster: 'eu',
    forceTLS: true,
    authEndpoint: `${import.meta.env.VITE_API_URL || 'https://herkeslersoruyor.panalix.com.tr/api'}/broadcasting/auth`,
    auth: {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
            'Accept': 'application/json'
        }
    }
});

export const subscribeToUserChannel = (userId, callbacks) => {
    const channelName = `private-user.${userId}`;
    const channel = pusher.subscribe(channelName);

    if (callbacks.onNewMessage) {
        channel.bind('new-message', callbacks.onNewMessage);
    }

    if (callbacks.onMessagesRead) {
        channel.bind('messages-read', callbacks.onMessagesRead);
    }

    if (callbacks.onUserTyping) {
        channel.bind('user-typing', callbacks.onUserTyping);
    }

    if (callbacks.onMessageUpdated) {
        channel.bind('message-updated', callbacks.onMessageUpdated);
    }

    if (callbacks.onMessageDeleted) {
        channel.bind('message-deleted', callbacks.onMessageDeleted);
    }

    if (callbacks.onMessageReaction) {
        channel.bind('message-reaction', callbacks.onMessageReaction);
    }

    if (callbacks.onEphemeralModeUpdated) {
        channel.bind('ephemeral-mode-updated', callbacks.onEphemeralModeUpdated);
    }

    if (callbacks.onScreenshotTaken) {
        channel.bind('screenshot-taken', callbacks.onScreenshotTaken);
    }

    if (callbacks.onNotification) {
        channel.bind('notification', callbacks.onNotification);
    }

    return channel;
};

export const unsubscribeFromChannel = (userId) => {
    const channelName = `private-user.${userId}`;
    pusher.unsubscribe(channelName);
};

export default pusher;
