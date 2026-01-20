import React, { useState, useEffect, useRef } from 'react';
import { pusher } from '../services/pusherClient';

const PusherTestPage = () => {
    const [logs, setLogs] = useState([]);
    const [connectionState, setConnectionState] = useState(pusher.connection.state);
    const [testChannelName, setTestChannelName] = useState('public-test');
    const [isSubscribed, setIsSubscribed] = useState(false);
    const channelRef = useRef(null);

    const addLog = (message, type = 'info') => {
        const timestamp = new Date().toLocaleTimeString();
        setLogs(prev => [`[${timestamp}] ${message}`, ...prev]);
    };

    useEffect(() => {
        addLog('PusherTestPage mounted. Initializiing listeners...');
        addLog(`Current connection state: ${pusher.connection.state}`);
        addLog(`API URL (VITE_API_URL): ${import.meta.env.VITE_API_URL}`);
        addLog(`Pusher Key: ${pusher.key}`);
        addLog(`Pusher Cluster: ${pusher.config.cluster}`);

        const handleStateChange = (states) => {
            setConnectionState(states.current);
            addLog(`Connection state changed: ${states.previous} -> ${states.current}`, 'warning');
        };

        const handleConnected = () => {
            addLog(`Connected to Pusher! Socket ID: ${pusher.connection.socket_id}`, 'success');
        };

        const handleError = (err) => {
            addLog(`Connection error: ${JSON.stringify(err)}`, 'error');
        };

        pusher.connection.bind('state_change', handleStateChange);
        pusher.connection.bind('connected', handleConnected);
        pusher.connection.bind('error', handleError);

        return () => {
            pusher.connection.unbind('state_change', handleStateChange);
            pusher.connection.unbind('connected', handleConnected);
            pusher.connection.unbind('error', handleError);
        };
    }, []);

    const handleSubscribe = () => {
        if (!testChannelName) return;

        try {
            addLog(`Attempting to subscribe to channel: ${testChannelName}...`);
            const channel = pusher.subscribe(testChannelName);
            channelRef.current = channel;

            channel.bind('pusher:subscription_succeeded', () => {
                addLog(`Successfully subscribed to ${testChannelName}`, 'success');
                setIsSubscribed(true);
            });

            channel.bind('pusher:subscription_error', (status) => {
                addLog(`Subscription error for ${testChannelName}: ${JSON.stringify(status)}`, 'error');
                setIsSubscribed(false);
            });

            // Bind to all events on this channel to see what comes through
            channel.bind_global((eventName, data) => {
                addLog(`Received event [${eventName}] on ${testChannelName}: ${JSON.stringify(data)}`, 'info');
            });

        } catch (e) {
            addLog(`Exception during subscribe: ${e.message}`, 'error');
        }
    };

    const handleUnsubscribe = () => {
        if (testChannelName && channelRef.current) {
            addLog(`Unsubscribing from ${testChannelName}...`);
            pusher.unsubscribe(testChannelName);
            channelRef.current = null;
            setIsSubscribed(false);
        }
    };

    const clearLogs = () => {
        setLogs([]);
    };

    const getStatusColor = (state) => {
        switch (state) {
            case 'connected': return 'text-green-500';
            case 'connecting': return 'text-yellow-500';
            case 'unavailable': return 'text-orange-500';
            case 'failed': return 'text-red-500';
            case 'disconnected': return 'text-gray-500';
            default: return 'text-gray-700';
        }
    };

    return (
        <div className="p-6 max-w-4xl mx-auto">
            <h1 className="text-2xl font-bold mb-4">Pusher Connection Diagnostics</h1>

            <div className="bg-white p-4 rounded-lg shadow mb-6">
                <h2 className="text-lg font-semibold mb-2">Connection Status</h2>
                <div className="flex items-center gap-2 mb-2">
                    <span className="font-medium">State:</span>
                    <span className={`font-bold text-lg ${getStatusColor(connectionState)} uppercase`}>{connectionState}</span>
                </div>
                <div className="text-sm text-gray-600 space-y-1">
                    <p><strong>API URL:</strong> {import.meta.env.VITE_API_URL || 'Not Set'}</p>
                    <p><strong>Pusher Key:</strong> {pusher.key}</p>
                    <p><strong>Cluster:</strong> {pusher.config.cluster}</p>
                    <p><strong>Auth Endpoint:</strong> {pusher.config.authEndpoint}</p>
                </div>
            </div>

            <div className="bg-white p-4 rounded-lg shadow mb-6">
                <h2 className="text-lg font-semibold mb-2">Channel Test</h2>
                <div className="flex gap-2 mb-2">
                    <input
                        type="text"
                        value={testChannelName}
                        onChange={(e) => setTestChannelName(e.target.value)}
                        className="border p-2 rounded flex-grow"
                        placeholder="Enter channel name (e.g. public-test or private-user.1)"
                    />
                    {!isSubscribed ? (
                        <button
                            onClick={handleSubscribe}
                            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
                        >
                            Subscribe
                        </button>
                    ) : (
                        <button
                            onClick={handleUnsubscribe}
                            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700"
                        >
                            Unsubscribe
                        </button>
                    )}
                </div>
                <p className="text-xs text-gray-500">
                    Note: Private channels (starting with <code>private-</code>) require authentication.
                    Check logs for auth errors if you try one.
                </p>
            </div>

            <div className="bg-gray-900 text-green-400 p-4 rounded-lg shadow h-96 overflow-y-auto font-mono text-sm relative">
                <div className="flex justify-between items-center mb-2 sticky top-0 bg-gray-900 pb-2 border-b border-gray-700">
                    <h3 className="font-bold">Logs</h3>
                    <button onClick={clearLogs} className="text-xs text-gray-400 hover:text-white underline">Clear</button>
                </div>
                <div className="space-y-1">
                    {logs.length === 0 && <p className="text-gray-600 italic">No logs yet...</p>}
                    {logs.map((log, index) => (
                        <div key={index} className="break-all">{log}</div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default PusherTestPage;
