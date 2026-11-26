import { DiagnosticsController } from './diagnostics.controller.js';
import { AgentConversationsController } from './agent-conversations.controller.js';
import { FormDraftsController } from './form-drafts.controller.js';
import { PlatformDrafts } from './form-drafts.js';
import { CreateFormController } from './create-form.controller.js';
import { OperationRecordsController } from './operation-records.controller.js';
import { LocalLoginController } from './local-login.controller.js';
import { JoinRequestsController } from './join-requests.controller.js';
import { MembersController } from './members.controller.js';
import { CatalogController } from './catalog.controller.js';
import { Module } from '@nestjs/common';
import { PlatformAccess } from './access.js';
import { PlatformDatabase } from './database.js';
import { GitHubAccess } from './github-access.js';
import { GitHubController } from './github.controller.js';
import { GitHubProvider } from './github-provider.js';
import { PlatformForms } from './forms.js';
import { PlatformController } from './platform.controller.js';
import { PlatformReleases } from './releases.js';
import { ReleaseBuild } from './release-build.js';

@Module({
  controllers: [
    CreateFormController,
    DiagnosticsController,
    AgentConversationsController,
    FormDraftsController,
    OperationRecordsController,
    PlatformController,
    LocalLoginController,
    GitHubController,
    CatalogController,
    MembersController,
    JoinRequestsController,
  ],
  providers: [
    PlatformDatabase,
    PlatformDrafts,
    PlatformAccess,
    PlatformForms,
    PlatformReleases,
    ReleaseBuild,
    GitHubAccess,
    GitHubProvider,
  ],
  exports: [PlatformDatabase, PlatformAccess, PlatformForms],
})
export class PlatformModule {}
