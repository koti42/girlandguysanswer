import React, { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usersAPI } from '../services/api';

const GoogleCallback = () => {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { updateUser } = useAuth();

    useEffect(() => {
        const token = searchParams.get('token');
        const genderRequired = searchParams.get('gender_required');

        if (token) {
            localStorage.setItem('token', token);



            const fetchUserAndRedirect = async () => {
                try {
                    const response = await usersAPI.getMe();
                    const userData = response.data.data?.user || response.data.user || response.data.data;

                    if (userData) {
                        localStorage.setItem('user', JSON.stringify(userData));
                        updateUser(userData);

                        if (genderRequired === 'true' || !userData.gender) {
                            navigate('/complete-profile', { replace: true });
                        } else {
                            navigate('/', { replace: true });
                        }
                    } else {
                        throw new Error('User data not found');
                    }
                } catch (error) {
                    console.error('Google Login Error:', error);
                    localStorage.removeItem('token');
                    localStorage.removeItem('user');
                    navigate('/login', { replace: true });
                }
            };

            fetchUserAndRedirect();
        } else {
            navigate('/login');
        }
    }, [searchParams, navigate]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
            <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-coral mx-auto mb-4"></div>
                <p className="text-gray-600 dark:text-gray-400 font-medium">Google ile giriş yapılıyor...</p>
            </div>
        </div>
    );
};

export default GoogleCallback;
