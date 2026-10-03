'use strict';
const life = require('../../../scripts/bible/core/lifecycle-core');
const {buildApproval} = require('../../../scripts/bible/commands/human-approval');
function orderFor(state,at) {
  return buildApproval(state,life.lifecycleSnapshot(state), {
    decision:'ALLOW_COMPLETED_WORK', approved_by:'explicit-test-human', approved_at_utc:at,
    reason:'Explicit authorization fixture for the pre-existing lifecycle scenarios.',
    workflow_run_id:'1234',workflow_run_attempt:1,workflow_name:'Bible Human Approval',
    repository:'Diesper/Manga_Translator',target_branch:'docs/project-bible',branch_head_sha:'f'.repeat(40)
  });
}
module.exports={orderFor};
