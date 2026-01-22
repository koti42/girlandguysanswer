import Pusher from 'pusher-js';

export const pusher = new Pusher('5e3395e614923bc06ebe', {
    cluster: 'eu',
    forceTLS: true,
    authEndpoint: `${import.meta.env.VITE_API_URL || 'http://127.0.0.1:8003/api'}/broadcasting/auth`,
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

    return channel;
};

export const unsubscribeFromChannel = (userId) => {
    const channelName = `private-user.${userId}`;
    pusher.unsubscribe(channelName);
};

export default pusher;
