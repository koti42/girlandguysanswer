import Pusher from 'pusher-js';

export const pusher = new Pusher('5e3395e614923bc06ebe', {
    cluster: 'eu',
    forceTLS: true,
    authEndpoint: 'http://127.0.0.1:8003/api/broadcasting/auth',
    auth: {
        headers: {
            'Authorization': `Bearer ${localStorage.getItem('token') || ''}`,
            'Accept': 'application/json'
        }
    }
});

// Debug: Connection state changes
pusher.connection.bind('state_change', function (states) {
    console.log('🔌 Pusher state changed:', states.previous, '->', states.current);
});

pusher.connection.bind('connected', function () {
    console.log('✅ Pusher connected! Socket ID:', pusher.connection.socket_id);
});

pusher.connection.bind('error', function (err) {
    console.error('❌ Pusher connection error:', err);
});

export const subscribeToUserChannel = (userId, callbacks) => {
    const channelName = `private-user.${userId}`;
    console.log('📡 Subscribing to channel:', channelName);

    const channel = pusher.subscribe(channelName);

    // Debug: Subscription events
    channel.bind('pusher:subscription_succeeded', function () {
        console.log('✅ Successfully subscribed to', channelName);
    });

    channel.bind('pusher:subscription_error', function (error) {
        console.error('❌ Subscription error for', channelName, ':', error);
    });

    if (callbacks.onNewMessage) {
        channel.bind('new-message', (data) => {
            console.log('📨 New message received:', data);
            callbacks.onNewMessage(data);
        });
    }

    return channel;
};

export const unsubscribeFromChannel = (userId) => {
    const channelName = `private-user.${userId}`;
    console.log('🔌 Unsubscribing from channel:', channelName);
    pusher.unsubscribe(channelName);
};

export default pusher;
