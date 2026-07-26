import axios from 'axios';

const APIClient = axios.create({
  baseURL: '/backend/',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

export default APIClient;