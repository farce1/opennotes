import { useContext } from 'react';
import { UpdateContext } from '../contexts/UpdateContext';

export function useUpdate() {
  return useContext(UpdateContext);
}
