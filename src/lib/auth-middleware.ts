import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import type { Role } from '@/lib/validations';

export async function requireAdmin(request?: Request, returnSession = false) {
  const session = await getServerSession(authOptions);
  
  if (!session?.user) {
    throw new Error('Unauthorized');
  }
  
  const ROLE_RANK: Record<Role, number> = {
    USER: 0,
    DEVELOPER: 1,
    ADMIN: 2,
    SYSTEM_ADMIN: 3,
  };
  
  if (ROLE_RANK[session.user.role] < ROLE_RANK.ADMIN) {
    throw new Error('Unauthorized');
  }
  
  return returnSession ? session : true;
}
