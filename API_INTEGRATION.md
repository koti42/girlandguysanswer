# API Entegrasyon Dokümantasyonu

Bu dokümantasyon, Kızılınkalarsoruyor frontend uygulamasının backend API ile nasıl entegre edileceğini açıklar.

## Base URL
```
http://localhost:3000/api
```
veya production:
```
https://api.kizilinkalarsoruyor.com/api
```

---

## 1. Kullanıcı Kaydı (Register)

### Endpoint
```
POST /auth/register
```

### Request Headers
```json
{
  "Content-Type": "application/json"
}
```

### Request Body
```json
{
  "username": "ornek_kullanici",
  "email": "kullanici@example.com",
  "password": "123456",
  "gender": "female"
}
```

#### Field Açıklamaları:
- `username` (string, required): Kullanıcı adı, minimum 2 karakter
- `email` (string, required): Geçerli email adresi
- `password` (string, required): Minimum 6 karakter
- `gender` (string, required): `"male"` veya `"female"`

### Success Response (201 Created)
```json
{
  "success": true,
  "message": "Kullanıcı başarıyla oluşturuldu",
  "data": {
    "user": {
      "id": 1,
      "username": "ornek_kullanici",
      "email": "kullanici@example.com",
      "gender": "female",
      "createdAt": "2026-01-20T10:05:00Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Error Response (400 Bad Request)
```json
{
  "success": false,
  "message": "Validation error",
  "errors": {
    "username": "Kullanıcı adı zaten kullanılıyor",
    "email": "E-posta adresi geçersiz"
  }
}
```

---

## 2. Kullanıcı Girişi (Login)

### Endpoint
```
POST /auth/login
```

### Request Headers
```json
{
  "Content-Type": "application/json"
}
```

### Request Body
```json
{
  "email": "kullanici@example.com",
  "password": "123456"
}
```

#### Field Açıklamaları:
- `email` (string, required): Kayıtlı email adresi
- `password` (string, required): Kullanıcı şifresi

### Success Response (200 OK)
```json
{
  "success": true,
  "message": "Giriş başarılı",
  "data": {
    "user": {
      "id": 1,
      "username": "ornek_kullanici",
      "email": "kullanici@example.com",
      "gender": "female",
      "avatar": "https://i.pravatar.cc/150?u=1",
      "createdAt": "2026-01-20T10:05:00Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### Error Response (401 Unauthorized)
```json
{
  "success": false,
  "message": "E-posta veya şifre hatalı"
}
```

---

## 3. Soru Sorma (Create Question)

### Endpoint
```
POST /questions
```

### Request Headers
```json
{
  "Content-Type": "application/json",
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Request Body
```json
{
  "title": "Bu yaz düğün sezonu için abiye elbise önerileriniz neler?",
  "description": "<p>Detaylı açıklama HTML formatında...</p>",
  "category": "Moda & Güzellik",
  "tags": ["#düğünkombini", "#abiye"],
  "image": "https://images.unsplash.com/photo-123.jpg"
}
```

#### Field Açıklamaları:
- `title` (string, required): Soru başlığı, minimum 10 karakter
- `description` (string, optional): HTML formatında detaylı açıklama
- `category` (string, required): Kategori adı (mockData.js'deki categories listesinden)
- `tags` (array, optional): Etiketler dizisi, maksimum 5 etiket
- `image` (string, optional): Soru görseli URL'si

### Success Response (201 Created)
```json
{
  "success": true,
  "message": "Soru başarıyla oluşturuldu",
  "data": {
    "question": {
      "id": 123,
      "title": "Bu yaz düğün sezonu için abiye elbise önerileriniz neler?",
      "description": "<p>Detaylı açıklama HTML formatında...</p>",
      "category": "Moda & Güzellik",
      "tags": ["#düğünkombini", "#abiye"],
      "image": "https://images.unsplash.com/photo-123.jpg",
      "user": {
        "id": 1,
        "username": "ornek_kullanici",
        "gender": "female",
        "avatar": "https://i.pravatar.cc/150?u=1"
      },
      "stats": {
        "likes": 0,
        "comments": 0,
        "views": 0
      },
      "createdAt": "2026-01-20T10:10:00Z"
    }
  }
}
```

### Error Response (400 Bad Request)
```json
{
  "success": false,
  "message": "Validation error",
  "errors": {
    "title": "Soru başlığı en az 10 karakter olmalıdır",
    "category": "Kategori seçimi zorunludur"
  }
}
```

### Error Response (401 Unauthorized)
```json
{
  "success": false,
  "message": "Oturum açmanız gerekiyor"
}
```

---

## 4. Soruları Listeleme (Get Questions)

### Endpoint
```
GET /questions
```

### Query Parameters
- `page` (number, optional): Sayfa numarası (default: 1)
- `limit` (number, optional): Sayfa başına soru sayısı (default: 10)
- `category` (string, optional): Kategori filtresi (örn: "Moda & Güzellik")
- `gender` (string, optional): Cinsiyet filtresi (`"male"`, `"female"`)
- `search` (string, optional): Arama terimi
- `sort` (string, optional): Sıralama (`"latest"`, `"popular"`, `"trending"`)

### Example Request
```
GET /questions?page=1&limit=10&gender=female&sort=latest
```

### Request Headers
```json
{
  "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```
*Not: Authorization opsiyonel, ancak giriş yapmış kullanıcılar için önerilir*

### Success Response (200 OK)
```json
{
  "success": true,
  "data": {
    "questions": [
      {
        "id": 1,
        "title": "Bu yaz düğün sezonu için abiye elbise önerileriniz neler?",
        "category": "Moda & Güzellik",
        "tags": ["#düğünkombini", "#abiye"],
        "image": "https://images.unsplash.com/photo-123.jpg",
        "user": {
          "id": 4,
          "username": "Zeynep_Yildiz",
          "gender": "female",
          "avatar": "https://i.pravatar.cc/150?u=4",
          "badge": null
        },
        "stats": {
          "likes": 245,
          "comments": 34,
          "views": 1205
        },
        "createdAt": "2026-01-20T08:30:00Z",
        "updatedAt": "2026-01-20T09:15:00Z"
      }
    ],
    "pagination": {
      "currentPage": 1,
      "totalPages": 5,
      "totalQuestions": 47,
      "limit": 10,
      "hasNextPage": true,
      "hasPreviousPage": false
    }
  }
}
```

### Error Response (400 Bad Request)
```json
{
  "success": false,
  "message": "Invalid query parameters",
  "errors": {
    "gender": "Gender must be 'male' or 'female'"
  }
}
```

---

## 5. Tek Soru Detayı (Get Question Detail)

### Endpoint
```
GET /questions/:id
```

### Example Request
```
GET /questions/123
```

### Success Response (200 OK)
```json
{
  "success": true,
  "data": {
    "question": {
      "id": 123,
      "title": "Bu yaz düğün sezonu için abiye elbise önerileriniz neler?",
      "description": "<p>Detaylı açıklama HTML formatında...</p>",
      "category": "Moda & Güzellik",
      "tags": ["#düğünkombini", "#abiye"],
      "image": "https://images.unsplash.com/photo-123.jpg",
      "user": {
        "id": 1,
        "username": "ornek_kullanici",
        "gender": "female",
        "avatar": "https://i.pravatar.cc/150?u=1"
      },
      "stats": {
        "likes": 245,
        "comments": 34,
        "views": 1205
      },
      "createdAt": "2026-01-20T08:30:00Z",
      "updatedAt": "2026-01-20T09:15:00Z"
    },
    "answers": [
      {
        "id": 1,
        "content": "<p>Cevap içeriği...</p>",
        "user": {
          "id": 2,
          "username": "Ayse_K",
          "gender": "female",
          "avatar": "https://i.pravatar.cc/150?u=2"
        },
        "likes": 12,
        "isAccepted": true,
        "createdAt": "2026-01-20T09:00:00Z"
      }
    ]
  }
}
```

---

## Genel Notlar

### Authentication
- Login ve Register'dan dönen `token`'ı localStorage'a kaydedin
- Her API isteğinde `Authorization: Bearer {token}` header'ı gönderin
- Token süresi dolduğunda 401 hatası alırsınız, kullanıcıyı login sayfasına yönlendirin

### Error Handling
Tüm error response'lar şu formatta gelir:
```json
{
  "success": false,
  "message": "Hata mesajı",
  "errors": {
    "field": "Alan bazlı hata mesajı"
  }
}
```

### HTTP Status Codes
- `200` - Success
- `201` - Created
- `400` - Bad Request (validation errors)
- `401` - Unauthorized (authentication required)
- `403` - Forbidden (insufficient permissions)
- `404` - Not Found
- `500` - Internal Server Error

### Rate Limiting
- Login/Register: 5 istek / dakika / IP
- Soru sorma: 10 soru / saat / kullanıcı
- Diğer endpoint'ler: 100 istek / dakika / kullanıcı

---

## Frontend Entegrasyon Örneği

### Axios Setup
```javascript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3000/api',
  headers: {
    'Content-Type': 'application/json'
  }
});

// Request interceptor - token ekle
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('authToken');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor - hata yönetimi
api.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('authToken');
      window.location.href = '/login';
    }
    return Promise.reject(error.response?.data || error);
  }
);

export default api;
```

### Kullanım Örnekleri

#### Register
```javascript
import api from './api';

const handleRegister = async (formData) => {
  try {
    const response = await api.post('/auth/register', {
      username: formData.username,
      email: formData.email,
      password: formData.password,
      gender: formData.gender
    });
    
    localStorage.setItem('authToken', response.data.token);
    navigate('/');
  } catch (error) {
    setErrors(error.errors || {});
  }
};
```

#### Login
```javascript
const handleLogin = async (formData) => {
  try {
    const response = await api.post('/auth/login', {
      email: formData.email,
      password: formData.password
    });
    
    localStorage.setItem('authToken', response.data.token);
    navigate('/');
  } catch (error) {
    setError(error.message);
  }
};
```

#### Soru Sorma
```javascript
const handleAskQuestion = async (formData) => {
  try {
    const response = await api.post('/questions', {
      title: formData.title,
      description: formData.description,
      category: formData.category,
      tags: formData.tags,
      image: formData.image
    });
    
    navigate(`/question/${response.data.question.id}`);
  } catch (error) {
    setErrors(error.errors || {});
  }
};
```

#### Soruları Listeleme
```javascript
const fetchQuestions = async (filters) => {
  try {
    const params = new URLSearchParams({
      page: filters.page || 1,
      limit: 10,
      ...(filters.gender && { gender: filters.gender }),
      ...(filters.category && { category: filters.category }),
      ...(filters.search && { search: filters.search })
    });
    
    const response = await api.get(`/questions?${params}`);
    setQuestions(response.data.questions);
    setPagination(response.data.pagination);
  } catch (error) {
    console.error('Sorular yüklenemedi:', error);
  }
};
```
