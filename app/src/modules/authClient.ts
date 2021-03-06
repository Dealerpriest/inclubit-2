// import axios, { AxiosInstance } from 'axios';
import { NonGuestUserRole, UserData } from 'shared-types/CustomTypes';
import { AxiosResponse } from 'axios';
import { api } from 'boot/axios';

import { Prisma, Gathering } from '@prisma/client';

// TODO: Move prisma functions and types to shared modules/types so we can use same types on consuming and producing sides
const gatheringWithRoomsAndUsers = Prisma.validator<Prisma.GatheringArgs>()({
  include: { rooms: true, users: true },
});
type GatheringWithRoomsAndUsers = Prisma.GatheringGetPayload<typeof gatheringWithRoomsAndUsers>;

const handleResponse = async <ReturnType>(apiCall: () => Promise<AxiosResponse<ReturnType>>) => {
  const response = await apiCall();
  console.log('user/auth Api response received:', response);
  return response.data;
};

export const login = async (username: string, password: string) => {
  try {
    const response = await api.post('/login', {
      username,
      password,
    });
    return response.data;
  } catch (e: any) {
    return Promise.reject(e.response);
  }
};

const userWithIncludes = Prisma.validator<Prisma.UserArgs>()({
  include: {
    gathering: true,
    role: true,
  },
});

// TODO: Dont declare these include types redundantly all over the code base!
type UserWithIncludes = Prisma.UserGetPayload<typeof userWithIncludes>;
export const deleteUser = (uuid: string) => api.post('delete-user', { uuid });
export const createUser = (payload: {username: string, password: string, gathering?: string, role: NonGuestUserRole}) => handleResponse<Omit<UserWithIncludes, 'password'>>(() => api.post('create', payload));
export const updateUser = (payload: {uuid: string, username?: string, password?: string, gathering?: string, role?: NonGuestUserRole}) => handleResponse<Omit<UserWithIncludes, 'password'>>(() => api.post('update', payload));
export const getUsers = (payload: Record<string, unknown>) => handleResponse<Omit<UserWithIncludes, 'password'>[]>(() => api.post('get-users', payload));
export const getGathering = (payload: {gatheringName?: string}) => handleResponse<GatheringWithRoomsAndUsers>(() => api.post('gathering', payload));
export const getAllGatherings = () => handleResponse<GatheringWithRoomsAndUsers[]>(() => api.get('allgatherings'));
export const deleteGathering = (payload: {gatheringName: string}) => handleResponse<Gathering>(() => api.post('delete-gathering', payload));
export const createGathering = (payload: {gatheringName: string}) => handleResponse<GatheringWithRoomsAndUsers>(() => api.post('create-gathering', payload));

export const getMe = () => handleResponse<UserData>(() => api.get('/me'));
export const getJwt = () => handleResponse<string>(() => api.get('/jwt'));
export const guestJwt = () => handleResponse<string>(() => api.get('/guest-jwt'));
export const logout = () => {
  handleResponse<void>(() => api.get('/logout'));
};
