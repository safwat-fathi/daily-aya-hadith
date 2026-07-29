import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { RequestId } from '../common/decorators/request-id.decorator';
import { ActorDto } from '../common/dto/actor.dto';
import type { PaginatedResponse } from '../common/dto/pagination.dto';
import {
  CreateWorkspaceDto,
  ListWorkspacesQueryDto,
  UpdateWorkspaceDto,
  VerifyTokenResponseDto,
  WorkspaceIdParamDto,
  WorkspaceResponseDto,
} from './dto/workspace.dto';
import {
  WorkspacesService,
  type VerifyTokenResult,
  type WorkspaceRecord,
} from './workspaces.service';

@ApiTags('Workspaces')
@ApiSecurity('admin-key')
@Controller('workspaces')
export class WorkspacesController {
  constructor(private readonly workspacesService: WorkspacesService) {}

  @Post()
  @ApiOperation({ summary: 'Register the manually configured Slack workspace' })
  @ApiCreatedResponse({ type: WorkspaceResponseDto })
  create(
    @Body() dto: CreateWorkspaceDto,
    @RequestId() requestId: string,
  ): Promise<WorkspaceRecord> {
    return this.workspacesService.create(dto, requestId);
  }

  @Get()
  @ApiOperation({ summary: 'List Slack workspaces' })
  @ApiOkResponse({ type: WorkspaceResponseDto, isArray: true })
  list(@Query() query: ListWorkspacesQueryDto): Promise<PaginatedResponse<WorkspaceRecord>> {
    return this.workspacesService.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a Slack workspace' })
  @ApiOkResponse({ type: WorkspaceResponseDto })
  getById(@Param() params: WorkspaceIdParamDto): Promise<WorkspaceRecord> {
    return this.workspacesService.getById(params.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update workspace name, token alias, or installation status' })
  @ApiOkResponse({ type: WorkspaceResponseDto })
  update(
    @Param() params: WorkspaceIdParamDto,
    @Body() dto: UpdateWorkspaceDto,
    @RequestId() requestId: string,
  ): Promise<WorkspaceRecord> {
    return this.workspacesService.update(params.id, dto, requestId);
  }

  @Post(':id/verify-token')
  @ApiOperation({ summary: 'Verify the configured bot token with Slack auth.test' })
  @ApiCreatedResponse({ type: VerifyTokenResponseDto })
  verifyToken(
    @Param() params: WorkspaceIdParamDto,
    @Body() dto: ActorDto,
    @RequestId() requestId: string,
  ): Promise<VerifyTokenResult> {
    return this.workspacesService.verifyToken(params.id, dto, requestId);
  }
}
