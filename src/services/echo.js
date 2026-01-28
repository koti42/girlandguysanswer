import Echo from 'laravel-echo';
import Pusher from 'pusher-js';

window.Pusher = Pusher;

const getAuthToken = () => {
    return localStorage.getItem('token');
};

const createEcho = () => {
    return new Echo({
        broadcaster: 'pusher',
        key: '5e3395e614923bc06ebe', 
        cluster: 'eu',
        forceTLS: true,
        encrypted: true,
        authEndpoint: `${import.meta.env.VITE_API_URL || 'https://herkeslersoruyor.panalix.com.tr/api'}/broadcasting/auth`,
        auth: {
            headers: {
                Authorization: `Bearer ${getAuthToken()}`,
                Accept: 'application/json'
            }
        },
        authorizer: (channel, options) => {
            return {
                authorize: (socketId, callback) => {
                    fetch(`${import.meta.env.VITE_API_URL || 'https://herkeslersoruyor.panalix.com.tr/api'}/broadcasting/auth`, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${getAuthToken()}`,
                            'Accept': 'application/json'
                        },
                        body: JSON.stringify({
                            socket_id: socketId,
                            channel_name: channel.name
                        })
                    })
                        .then(response => response.json())
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
