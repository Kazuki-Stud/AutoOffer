import { db } from '../database.js';

export async function seedDatabase() {
    const platformCount = await db.platforms_dict.count();
    if (platformCount > 0) return;

    const platformId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
    const taskListId = '11111111-1111-1111-1111-111111111111';
    const taskDetailId = '22222222-2222-2222-2222-222222222222';
    const elContainerId = '33333333-3333-3333-3333-333333333333';
    const elTitleId = '44444444-4444-4444-4444-444444444444';
    const elLinkId = '55555555-5555-5555-5555-555555555555';
    const elCompanyId = '66666666-6666-6666-6666-666666666666';

    await db.platforms_dict.bulkAdd([
        { id: platformId, name: 'Indeed', code: 'indeed' }
    ]);

    await db.selector_tasks_dict.bulkAdd([
        { id: taskListId, code: 'parse_vacancy_list', name: 'Parse Vacancy List' },
        { id: taskDetailId, code: 'parse_vacancy_detail', name: 'Parse Vacancy Detail' }
    ]);

    await db.selector_element_types_dict.bulkAdd([
        { id: elContainerId, code: 'container', name: 'Container' },
        { id: elTitleId, code: 'title', name: 'Title' },
        { id: elLinkId, code: 'link', name: 'Link' },
        { id: elCompanyId, code: 'company', name: 'Company' }
    ]);

    await db.regions_dict.bulkAdd([
        { id: 'r1111111-1111-1111-1111-111111111111', code: 'AMERICA', name: 'America' },
        { id: 'r2222222-2222-2222-2222-222222222222', code: 'EU', name: 'EU' },
        { id: 'r3333333-3333-3333-3333-333333333333', code: 'CIS', name: 'CIS' },
        { id: 'r4444444-4444-4444-4444-444444444444', code: 'OTHER', name: 'Other' }
    ]);

    await db.levels_dict.bulkAdd([
        { id: 'l1111111-1111-1111-1111-111111111111', name: 'Junior' },
        { id: 'l2222222-2222-2222-2222-222222222222', name: 'Middle' },
        { id: 'l3333333-3333-3333-3333-333333333333', name: 'Senior' }
    ]);

    await db.work_formats_dict.bulkAdd([
        { id: 'wf111111-1111-1111-1111-111111111111', name: 'Remote' },
        { id: 'wf222222-2222-2222-2222-222222222222', name: 'Offline' },
        { id: 'wf333333-3333-3333-3333-333333333333', name: 'Hybrid' }
    ]);

    await db.employment_types_dict.bulkAdd([
        { id: 'et111111-1111-1111-1111-111111111111', name: 'Full-time' },
        { id: 'et222222-2222-2222-2222-222222222222', name: 'Part-time' }
    ]);

    await db.selectors.bulkAdd([
        {
            id: 's1111111-1111-1111-1111-111111111111',
            platform_id: platformId,
            task_id: taskListId,
            element_type_id: elContainerId,
            url_pattern: 'indeed.com',
            selector_string: 'ul.css-pygyny.eu4oa1w0 li, .mosaic-provider-jobcards-1ppyh6m',
            is_active: true,
            updated_at: new Date().toISOString()
        },
        {
            id: 's2222222-2222-2222-2222-222222222222',
            platform_id: platformId,
            task_id: taskListId,
            element_type_id: elTitleId,
            url_pattern: 'indeed.com',
            selector_string: '.jcs-JobTitle span[title], a.jcs-JobTitle',
            is_active: true,
            updated_at: new Date().toISOString()
        },
        {
            id: 's3333333-3333-3333-3333-333333333333',
            platform_id: platformId,
            task_id: taskListId,
            element_type_id: elLinkId,
            url_pattern: 'indeed.com',
            selector_string: 'a.jcs-JobTitle',
            is_active: true,
            updated_at: new Date().toISOString()
        },
        {
            id: 's4444444-4444-4444-4444-444444444444',
            platform_id: platformId,
            task_id: taskListId,
            element_type_id: elCompanyId,
            url_pattern: 'indeed.com',
            selector_string: '[data-testid="company-name"]',
            is_active: true,
            updated_at: new Date().toISOString()
        }
    ]);
}