import type { PoolClient } from 'pg'
import { AppError } from './errors'

type StaffRole = 'MANAGER' | 'SERVICE_STAFF' | 'GUARD'

const uniqueIds = (ids: string[]) => [...new Set(ids)]

const assertDepartmentsInSociety = async (
  client: PoolClient,
  societyId: string,
  departmentIds: string[],
) => {
  const ids = uniqueIds(departmentIds)

  if (ids.length === 0) {
    return ids
  }

  const result = await client.query<{ id: string }>(
    `
      select id
      from service_departments
      where society_id = $1
        and id = any($2::uuid[])
    `,
    [societyId, ids],
  )

  if (result.rows.length !== ids.length) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Choose departments from this society.',
    })
  }

  return ids
}

export const syncStaffDepartmentAssignments = async (
  client: PoolClient,
  societyId: string,
  userId: string,
  role: StaffRole,
  departmentIds: string[],
) => {
  if (role !== 'SERVICE_STAFF') {
    await client.query(
      `
        update service_staff_assignments ssa
        set is_active = false,
            is_primary = false,
            ended_at = coalesce(ssa.ended_at, now()),
            updated_at = now()
        from service_departments sd
        where sd.id = ssa.department_id
          and sd.society_id = $2
          and ssa.user_id = $1
          and ssa.is_active = true
      `,
      [userId, societyId],
    )
    return []
  }

  const nextDepartmentIds = await assertDepartmentsInSociety(client, societyId, departmentIds)

  await client.query(
    `
      update service_staff_assignments ssa
      set is_active = false,
          is_primary = false,
          ended_at = coalesce(ssa.ended_at, now()),
          updated_at = now()
      from service_departments sd
      where sd.id = ssa.department_id
        and sd.society_id = $2
        and ssa.user_id = $1
        and ssa.is_active = true
        and not (ssa.department_id = any($3::uuid[]))
    `,
    [userId, societyId, nextDepartmentIds],
  )

  for (const departmentId of nextDepartmentIds) {
    await client.query(
      `
        insert into service_staff_assignments (department_id, user_id, is_active, is_primary, ended_at)
        values ($1, $2, true, false, null)
        on conflict (department_id, user_id) do update
          set is_active = true,
              ended_at = null,
              updated_at = now()
      `,
      [departmentId, userId],
    )
  }

  return nextDepartmentIds
}
