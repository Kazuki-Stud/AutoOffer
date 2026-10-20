import { db } from '../database.js';

export async function seedDatabase() {
    try {
        const platformCount = await db.platforms_dict.count();
        if (platformCount > 0) return;

        const platformId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
        const taskListId = '11111111-1111-1111-1111-111111111111';
        const taskDetailId = '22222222-2222-2222-2222-222222222222';
        const taskSearchId = '33333333-1111-1111-1111-111111111111';

        const elContainerId = '33333333-3333-3333-3333-333333333333';
        const elTitleId = '44444444-4444-4444-4444-444444444444';
        const elLinkId = '55555555-5555-5555-5555-555555555555';
        const elSearchInputId = '77777777-7777-7777-7777-777777777777';
        const elSearchButtonId = '88888888-8888-8888-8888-888888888888';
        const elPaginationId = '99999999-9999-9999-9999-999999999999';
        const elDescriptionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

        await db.platforms_dict.bulkAdd([
            { id: platformId, name: 'Indeed', code: 'indeed' },
            { id: 'f58bc21c-69dd-4483-b678-1f13c3d4e580', name: 'LinkedIn', code: 'linkedin' }
        ]);

        await db.selector_tasks_dict.bulkAdd([
            { id: taskListId, code: 'parse_vacancy_list', name: 'Parse Vacancy List' },
            { id: taskDetailId, code: 'parse_vacancy_detail', name: 'Parse Vacancy Detail' },
            { id: taskSearchId, code: 'search_interaction', name: 'Search Interaction' }
        ]);

        await db.selector_element_types_dict.bulkAdd([
            { id: elContainerId, code: 'container', name: 'Container' },
            { id: elTitleId, code: 'title', name: 'Title' },
            { id: elLinkId, code: 'link', name: 'Link' },
            { id: elSearchInputId, code: 'search_input', name: 'Search Input' },
            { id: elSearchButtonId, code: 'search_button', name: 'Search Button' },
            { id: elPaginationId, code: 'pagination', name: 'Pagination' },
            { id: elDescriptionId, code: 'description', name: 'Job Description' }
        ]);

        await db.positions_dict.bulkAdd([
            { id: 'p1111111-1111-1111-1111-111111111111', name: 'Frontend Developer', is_verified: true },
            { id: 'p2222222-2222-2222-2222-222222222222', name: 'Backend Developer', is_verified: true },
            { id: 'p3333333-3333-3333-3333-333333333333', name: 'Full Stack Developer', is_verified: true },
            { id: 'p4444444-4444-4444-4444-444444444444', name: 'Software Engineer', is_verified: true },
            { id: 'p5555555-5555-5555-5555-555555555555', name: 'DevOps Engineer', is_verified: true },
            { id: 'p6666666-6666-6666-6666-666666666666', name: 'QA Engineer', is_verified: true }
        ]);

        await db.currencies_dict.bulkAdd([
            { id: 'c1111111-1111-1111-1111-111111111111', code: 'USD', name: 'US Dollar' },
            { id: 'c2222222-2222-2222-2222-222222222222', code: 'EUR', name: 'Euro' },
            { id: 'c3333333-3333-3333-3333-333333333333', code: 'GBP', name: 'British Pound' }
        ]);

        await db.regions_dict.bulkAdd([
            { id: 'r1111111-1111-1111-1111-111111111111', code: 'AMERICA', name: 'America' },
            { id: 'r2222222-2222-2222-2222-222222222222', code: 'EU', name: 'EU' },
            { id: 'r3333333-3333-3333-3333-333333333333', code: 'CIS', name: 'CIS' },
            { id: 'r4444444-4444-4444-4444-444444444444', code: 'OTHER', name: 'Other' }
        ]);

        await db.levels_dict.bulkAdd([
            { id: 'l0000000-0000-0000-0000-000000000000', name: 'Intern' },
            { id: 'l1111111-1111-1111-1111-111111111111', name: 'Junior' },
            { id: 'l2222222-2222-2222-2222-222222222222', name: 'Middle' },
            { id: 'l3333333-3333-3333-3333-333333333333', name: 'Senior' },
            { id: 'l4444444-4444-4444-4444-444444444444', name: 'Lead' }
        ]);

        await db.work_formats_dict.bulkAdd([
            { id: 'wf111111-1111-1111-1111-111111111111', name: 'Remote' },
            { id: 'wf222222-2222-2222-2222-222222222222', name: 'Offline' },
            { id: 'wf333333-3333-3333-3333-333333333333', name: 'Hybrid' }
        ]);

        await db.employment_types_dict.bulkAdd([
            { id: 'et111111-1111-1111-1111-111111111111', name: 'Full-time' },
            { id: 'et222222-2222-2222-2222-222222222222', name: 'Part-time' },
            { id: 'et333333-3333-3333-3333-333333333333', name: 'Contract' }
        ]);

        await db.prompt_templates.bulkAdd([
            {
                id: 'pt111111-1111-1111-1111-111111111111',
                code: 'auto_detect_selectors',
                template: 'Analyze the given HTML snippet and output selectors for container, title, and link in JSON format.'
            }
        ]);

        await db.selectors.bulkAdd([
            {
                id: 's1111111-1111-1111-1111-111111111111',
                platform_id: platformId,
                task_id: taskListId,
                element_type_id: elContainerId,
                url_pattern: 'indeed.com',
                selector_string: 'ul.css-pygyny.eu4oa1w0 li, .mosaic-provider-jobcards-1ppyh6m',
                is_active: 1,
                updated_at: new Date().toISOString()
            },
            {
                id: 's2222222-2222-2222-2222-222222222222',
                platform_id: platformId,
                task_id: taskListId,
                element_type_id: elTitleId,
                url_pattern: 'indeed.com',
                selector_string: '.jcs-JobTitle span[title], a.jcs-JobTitle',
                is_active: 1,
                updated_at: new Date().toISOString()
            },
            {
                id: 's3333333-3333-3333-3333-333333333333',
                platform_id: platformId,
                task_id: taskListId,
                element_type_id: elLinkId,
                url_pattern: 'indeed.com',
                selector_string: 'a.jcs-JobTitle',
                is_active: 1,
                updated_at: new Date().toISOString()
            },
            {
                id: 's5555555-5555-5555-5555-555555555555',
                platform_id: platformId,
                task_id: taskSearchId,
                element_type_id: elSearchInputId,
                url_pattern: 'indeed.com',
                selector_string: '#text-input-what',
                is_active: 1,
                updated_at: new Date().toISOString()
            },
            {
                id: 's6666666-6666-6666-6666-666666666666',
                platform_id: platformId,
                task_id: taskSearchId,
                element_type_id: elSearchButtonId,
                url_pattern: 'indeed.com',
                selector_string: 'button.yosegi-InlineWhatWhere-primaryButton',
                is_active: 1,
                updated_at: new Date().toISOString()
            },
            {
                id: 's7777777-7777-7777-7777-777777777777',
                platform_id: platformId,
                task_id: taskListId,
                element_type_id: elPaginationId,
                url_pattern: 'indeed.com',
                selector_string: 'a[data-testid="pagination-page-next"]',
                is_active: 1,
                updated_at: new Date().toISOString()
            },
            {
                id: 's8888888-8888-8888-8888-888888888888',
                platform_id: platformId,
                task_id: taskDetailId,
                element_type_id: elDescriptionId,
                url_pattern: 'indeed.com',
                selector_string: '#jobDescriptionText',
                is_active: 1,
                updated_at: new Date().toISOString()
            }
        ]);
        console.log('[AutoOffer Seed] Database seeded successfully.');
    } catch (err) {
        console.error('[AutoOffer Seed] Seeding error:', err);
    }
}