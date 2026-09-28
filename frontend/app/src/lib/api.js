// Shared axios client used across the frontend.
// Centralizing the baseURL makes it easy to change environments.
import axios from 'axios';

const apiBaseUrl = process.env.REACT_APP_API_URL || `${window.location.protocol}//${window.location.hostname}:4000`;

const api = axios.create({ baseURL: apiBaseUrl });

export { apiBaseUrl };
export default api;
