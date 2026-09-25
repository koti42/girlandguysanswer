import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

window.Pusher = Pusher;

const getAuthToken = () => {
    return localStorage.getItem('token');
};

const createEcho = () => {
    const API_URL = import.meta.env.VITE_API_URL || 'https://herkeslersoruyor.panalix.com.tr/api';
    
    return new Echo({
        broadcaster: 'pusher',
        key: '5e3395e614923bc06ebe', 
        cluster: 'eu',
        forceTLS: true,
        encrypted: true,
        authEndpoint: `${API_URL}/broadcasting/auth`,
        enabledTransports: ['ws', 'wss'],
        auth: {
            headers: {
                Authorization: `Bearer ${getAuthToken()}`,
                Accept: 'application/json'
            }
        },
        authorizer: (channel, _options) => {
            return {
                authorize: (socketId, callback) => {
                    const token = localStorage.getItem('token');
                    
                    if (!token) {
                        callback(true, { message: 'No authentication token' });
                        return;
                    }

                    fetch(`${API_URL}/broadcasting/auth`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${token}`,
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify({
                            socket_id: socketId,
                            channel_name: channel.name
                        })
                    })
                        .then(response => {
                            if (!response.ok) {
                                return response.json().then(err => {
                                    throw new Error(err.message || `Auth failed: ${response.status}`);
                                });
                            }
                            return response.json();
                        })
                        .then(data => {
                            callback(false, data);
                        })
                        .catch(error => {
                            callback(true, error);
                        });
                }
            };
        }
    });
};

export const echo = createEcho();

export default echo;
