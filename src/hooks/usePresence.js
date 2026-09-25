import { useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { usersAPI } from '../services/api';

const HEARTBEAT_INTERVAL = 60000; // 60 seconds

const usePresence = () => {
    const { user } = useAuth();
    const intervalRef = useRef(null);

    const sendHeartbeat = async () => {
        try {
            await usersAPI.heartbeat();
        } catch {
            // heartbeat kaçarsa bir sonraki tur yakalar
        }
    };

    useEffect(() => {
        if (!user) return;

        sendHeartbeat();

        intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                sendHeartbeat();
                if (!intervalRef.current) {
                    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
                }
            } else {
                if (intervalRef.current) {
                    clearInterval(intervalRef.current);
                    intervalRef.current = null;
                }
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [user]);
};

export default usePresence;
