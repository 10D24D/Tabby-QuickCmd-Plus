/**
 * QuickCommand+ 浮动面板组件
 * 功能描述：浮动在终端上的快捷命令面板，支持搜索/分组/执行/最小化/拖拽
 * 创建人：DD1024z + Deepseek-V4-Flash
 * 创建时间：2026-06-26
 */
import { Component, OnInit, OnDestroy, ViewChild, ElementRef, Optional, Inject } from '@angular/core'
import { ConfigService } from 'tabby-core'
import { QuickCommandService, QuickCommand, QuickCommandGroup, CommandStep, resolveSteps } from './qc-command.service'
import { QuickCommandI18nService } from './qc-i18n.service'

@Component({
  selector: 'qc-floating-panel',
  template: `
    <div class="qc-panel"
      [class.minimized]="minimized"
      [class.resizing]="resizing !== null"
      [style.left.px]="panelX"
      [style.top.px]="panelY"
      [style.width.px]="panelWidth"
      [style.height.px]="panelHeight || null"
      [style.max-height.px]="panelHeight ? null : autoMaxHeight"
      (mousedown)="noBubble($event)">

      <!-- 标题栏（可拖拽） -->
      <div class="qc-titlebar"
        (mousedown)="startDrag($event)">
        <!-- 标题固定为品牌名，不随语言本地化：与插件名 / 设置页菜单 / 关于页保持一致，
             也对齐 SFTP+ 面板标题的写法（SFTP+ 同样用固定品牌名，不翻译） -->
        <span class="qc-title">QuickCmd+</span>
        <span class="qc-ssh-label" *ngIf="sshHost">{{ sshHost }}</span>
        <div class="qc-title-actions">
          <span class="qc-action qc-action-settings" *ngIf="!hideSettingsEntry" title="{{ i18n.t('panel.settings') }}" (click)="onOpenSettings && onOpenSettings(); $event.stopPropagation()">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </span>
          <!-- 排序模式切换（齿轮右侧）：拖拽顺序 → 名称 → 执行次数 循环；非「拖拽顺序」时图标高亮 -->
          <span class="qc-action qc-action-sort" [class.active]="sortMode !== 'manual'"
            title="{{ i18n.t('panel.sort') }}: {{ sortModeLabel }}"
            (click)="cycleSortMode(); $event.stopPropagation()">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="M11 4h10"/><path d="M11 8h7"/><path d="M11 12h4"/>
            </svg>
          </span>
          <!-- tooltip 用 panel.pinPanel（面板常驻），与设置页同一文案；
               panel.pin/unpin 专指「钉到快捷入口」语义，只用于列表星标与芯片 ✕，勿在此复用 -->
          <span class="qc-action qc-action-pin" [class.active]="pinPanel" title="{{ i18n.t('panel.pinPanel') }}" (click)="togglePinPanel(); $event.stopPropagation()">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
              <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/>
            </svg>
          </span>
          <span class="qc-action qc-action-close" title="{{ i18n.t('panel.close') }}" (click)="doClose(); $event.stopPropagation()">&#x2715;</span>
        </div>
      </div>

      <!-- 搜索栏 + 分组筛选 -->
      <div class="qc-search" *ngIf="!minimized">
        <div class="qc-search-row">
          <!-- 分组筛选：自绘下拉。原生 <select> 在 Electron 无边框窗口下点击不弹出选项（平台级问题），
               改为面板内浮层，与书签/连接切换等浮层风格一致 -->
          <div class="qc-filter">
            <div class="qc-filter-btn" (click)="toggleFilterMenu($event)">
              <span class="qc-filter-text">{{ filterGroupLabel }}</span>
              <span class="qc-filter-caret">&#9662;</span>
            </div>
            <!-- mousedown 阻止冒泡：否则会被面板根的 noBubble 抢先收起，导致点选项无效 -->
            <div class="qc-filter-menu" *ngIf="filterMenuOpen" (mousedown)="$event.stopPropagation()">
              <div class="qc-filter-item" [class.active]="!filterGroup"
                (click)="chooseFilter('')">{{ i18n.t('app.all_groups') }}</div>
              <div class="qc-filter-item" [class.active]="filterGroup === '__auto__'"
                (click)="chooseFilter('__auto__')">{{ i18n.t('app.auto_filter') }}</div>
              <div class="qc-filter-item" *ngFor="let g of allGroups"
                [class.active]="filterGroup === (g.name || '__ungrouped__')"
                (click)="chooseFilter(g.name || '__ungrouped__')">{{ g.name || i18n.t('app.ungrouped') }}</div>
            </div>
          </div>
          <!-- 输入框与清除按钮同容器：✕ 绝对定位到输入框内部右端（原先是并排的独立元素，视觉上落在框外） -->
          <div class="qc-search-field">
            <input class="qc-search-input" type="text"
              [placeholder]="i18n.t('app.search')"
              [(ngModel)]="searchText"
              (input)="onSearch()"
              (keydown.enter)="executeFirst()"
              (keydown.escape)="doClose()">
            <span class="qc-search-clear" *ngIf="searchText"
              (click)="searchText=''; onSearch(); $event.stopPropagation()"
              [title]="i18n.t('app.clear_search')">&#x2715;</span>
          </div>
        </div>
      </div>

      <!-- 快速入口区（固定命令）——可拖拽排序 -->
      <div class="qc-quick-bar" *ngIf="!minimized && pinnedCommands.length > 0" (wheel)="onQuickBarWheel($event)">
        <div class="qc-quick-cmd" *ngFor="let pcmd of pinnedCommands"
          draggable="true"
          [attr.data-qc-quick-id]="pcmd.id"
          (dragstart)="onQuickDragStart($event, pcmd)"
          (dragover)="onQuickDragOver($event)"
          (dragleave)="onQuickDragLeave($event)"
          (drop)="onQuickDrop($event, pcmd)"
          (dragend)="onQuickDragEnd()"
          (click)="executeCommand(pcmd)" [title]="pcmd.text"
          (contextmenu)="onCmdContextMenu($event, pcmd)"
          [class.dragging]="quickDragId === pcmd.id"
          [class.drag-over-left]="quickDropId === pcmd.id && quickDropSide === 'left'"
          [class.drag-over-right]="quickDropId === pcmd.id && quickDropSide === 'right'">
          <span class="qc-quick-name">{{ pcmd.shortName || pcmd.name }}</span>
          <span class="qc-quick-remove" (click)="unpinQuick(pcmd); $event.stopPropagation()"
            [title]="i18n.t('panel.unpin')">&#x2715;</span>
        </div>
      </div>

      <!-- 命令列表（data-cols 由宽度决定：宽而矮时用多列填满横向空间） -->
      <div class="qc-list" *ngIf="!minimized" #listRef [attr.data-cols]="_cols" (scroll)="onListScroll()">
        <!-- 按分组渲染 -->
        <ng-container *ngFor="let group of displayGroups; let gi = index; trackBy: trackGroup">
          <div class="qc-group-header"
            (click)="toggleGroup(group.name)"
            (dragover)="$event.preventDefault()"
            (drop)="onDropToGroup($event, group.name)"
            (dragleave)="onDragLeave($event)">
            <span class="qc-group-arrow">{{ group.expanded ? '&#x25BC;' : '&#x25B6;' }}</span>
            <span class="qc-group-name">{{ group.name || i18n.t('app.ungrouped') }}</span>
            <span class="qc-group-count">{{ getGroupCommands(group.name).length }}</span>
            <span class="qc-group-edit" (click)="showGroupRenameDialog(group.name); $event.stopPropagation()" [title]="i18n.t('group.rename')">&#x270E;</span>
            <span class="qc-group-del" (click)="deleteGroup(group.name); $event.stopPropagation()" [title]="i18n.t('group.delete')">&#x2212;</span>
            <span class="qc-group-add" (click)="addCommandToGroup(group.name); $event.stopPropagation()" title="+ cmd">+</span>
          </div>

          <!-- 分组下的命令 -->
          <div *ngIf="group.expanded" class="qc-cmd-group-body"
            (dragover)="onListDragOver($event)"
            (dragleave)="onListDragLeave($event)"
            (drop)="onListDrop($event, group.name)">
            <div *ngFor="let cmd of getGroupCommands(group.name)" class="qc-cmd-row"
              (click)="executeCommand(cmd)"
              (dblclick)="editCommand(cmd)"
              [class.highlighted]="highlightedId === cmd.id"
              (dragover)="onDragOver($event)"
              (dragleave)="onDragLeave($event)"
              (drop)="onDrop($event, cmd)"
              (contextmenu)="onCmdContextMenu($event, cmd)">
              <span class="qc-cmd-drag" [attr.draggable]="sortMode === 'manual' ? 'true' : null"
                (dragstart)="onDragStart($event, cmd)"
                (dragend)="onDragEnd($event)"
                [title]="sortMode === 'manual' ? i18n.t('panel.drag_reorder') : i18n.t('panel.sort_hint')">⋮⋮</span>
              <div class="qc-cmd-body">
                <span class="qc-cmd-name">{{ cmd.name }}</span>
                <span class="qc-cmd-preview" [title]="cmd.text">{{ getPreview(cmd) }}</span>
              </div>
              <div class="qc-cmd-actions">
                <span class="qc-cmd-badge" *ngIf="cmd.params && cmd.params.length > 0" title="Has parameters">{{ getParamBadge(cmd) }}</span>
                <span class="qc-cmd-shortcut-badge" *ngIf="cmd.shortcut">{{ cmd.shortcut }}</span>
                <span class="qc-cmd-edit-btn" (click)="editCommand(cmd); $event.stopPropagation()" [title]="i18n.t('panel.edit')">&#x270E;</span>
                <span class="qc-cmd-del" (click)="deleteCommand(cmd); $event.stopPropagation()" [title]="i18n.t('panel.delete')">&#x2715;</span>
                <span class="qc-cmd-sendline" (click)="sendToLine(cmd); $event.stopPropagation()" [title]="i18n.t('panel.send_to_line')">&#x21E7;</span>
                <span class="qc-cmd-execute" (click)="executeAlways(cmd); $event.stopPropagation()" [title]="i18n.t('panel.send_and_exec')">&#x23CE;</span>
              </div>
              <span class="qc-cmd-pinbtn" (click)="togglePin(cmd); $event.stopPropagation()"
                [title]="cmd.pinned ? i18n.t('panel.unpin') : i18n.t('panel.pin')"
                [class.active]="cmd.pinned">&#x2605;</span>
            </div>
            <div class="qc-drop-end" [class.drag-over]="listDropOver"></div>
          </div>
        </ng-container>

        <!-- 空状态 -->
        <div class="qc-empty" *ngIf="filteredCommands.length === 0 && searchText">
          {{ i18n.t('app.noresults') }}
        </div>
        <div class="qc-empty" *ngIf="filteredCommands.length === 0 && !searchText && filterGroup === '__auto__'">
          {{ i18n.t('panel.no_auto_group') }}
        </div>
        <div class="qc-empty" *ngIf="filteredCommands.length === 0 && !searchText && filterGroup && filterGroup !== '__auto__'">
          {{ i18n.t('panel.empty_group') }}
        </div>
        <div class="qc-empty" *ngIf="filteredCommands.length === 0 && !searchText && !filterGroup">
          {{ i18n.t('panel.hint.search') }}
        </div>
      </div>

      <!-- 底部操作栏 -->
      <div class="qc-footer" *ngIf="!minimized">
        <span class="qc-add-btn" (click)="addCommand()">+ {{ i18n.t('panel.add') }}</span>
        <span class="qc-add-btn qc-add-group-btn" (click)="addNewGroup()">+ {{ i18n.t('group.add') }}</span>
        <span class="qc-usage-hint" *ngIf="selectedCount > 0">{{ selectedCount }} cmd</span>
      </div>

      <!-- 调整大小手柄 -->
      <div class="qc-resize-e"  (mousedown)="startResize($event, 'e')"></div>
      <div class="qc-resize-w"  (mousedown)="startResize($event, 'w')"></div>
      <div class="qc-resize-s"  (mousedown)="startResize($event, 's')"></div>
      <div class="qc-resize-n"  (mousedown)="startResize($event, 'n')"></div>
      <div class="qc-resize-se" (mousedown)="startResize($event, 'se')"></div>
      <div class="qc-resize-sw" (mousedown)="startResize($event, 'sw')"></div>
      <div class="qc-resize-ne" (mousedown)="startResize($event, 'ne')"></div>
      <div class="qc-resize-nw" (mousedown)="startResize($event, 'nw')"></div>
    </div>

    <!-- 添加/编辑命令弹窗 -->
    <div class="qc-overlay" *ngIf="showEditModal"></div>
    <div class="qc-edit-modal" *ngIf="showEditModal" (click)="$event.stopPropagation()" (keydown)="$event.stopPropagation()">
      <div class="qc-edit-title">{{ editCmd?.id ? i18n.t('settings.edit_cmd') : i18n.t('panel.add') }}</div>
      <div class="qc-edit-field">
        <label>{{ i18n.t('settings.name') }}</label>
        <input class="qc-edit-input" type="text" [(ngModel)]="editCmd.name" (keydown.enter)="saveEditCmd()" placeholder="e.g. git status">
      </div>

      <!-- 简称：仅用于固定快捷入口（书签）显示，避免长名称把快捷条撑满 -->
      <div class="qc-edit-field">
        <label>{{ i18n.t('settings.short_name') }}</label>
        <input class="qc-edit-input" type="text" [(ngModel)]="editCmd.shortName" (keydown.enter)="saveEditCmd()"
          maxlength="16" [placeholder]="i18n.t('settings.short_name_hint')">
      </div>

      <!-- 命令步骤列表 -->
      <div class="qc-steps-label">{{ i18n.t('settings.text') }}</div>
      <div class="qc-step-row" *ngFor="let step of editCmdSteps; let i = index"
        (dragover)="onStepDragOver($event, i)"
        (dragleave)="onStepDragLeave($event)"
        (drop)="onStepDrop($event, i)"
        [class.dragging]="stepDragIdx === i"
        [class.qc-step-disabled]="step.enabled === false">
        <span class="qc-step-drag" draggable="true"
          (dragstart)="onStepDragStart($event, i)"
          (dragend)="onStepDragEnd($event)" [title]="i18n.t('panel.drag_reorder')">⋮⋮</span>
        <input class="qc-step-enabled" type="checkbox"
          [(ngModel)]="step.enabled" [title]="step.enabled !== false ? i18n.t('settings.disable_step') : i18n.t('settings.enable_step')">
        <span class="qc-step-type"
          (click)="step.type = (step.type === 'break' ? 'command' : 'break'); $event.stopPropagation()"
          [title]="step.type === 'break' ? i18n.t('settings.step_type_cmd') : i18n.t('settings.step_type_break')"
          [class.is-break]="step.type === 'break'">{{ step.type === 'break' ? '&#x26A0;' : '&#x25B6;' }}</span>
        <input class="qc-step-delay" type="number" min="0" max="60" step="0.2"
          [(ngModel)]="step.delaySeconds" [placeholder]="i18n.t('settings.delay_short')"
          [title]="i18n.t('settings.delay_hint')">
        <textarea class="qc-step-input" [(ngModel)]="step.text" rows="1"
          *ngIf="step.type !== 'break'" [placeholder]="(i18n.t('settings.step_placeholder') + ' ' + (i+1))"
          (input)="autoGrow($event)" (keydown.enter)="saveEditCmd()"></textarea>
        <span class="qc-step-break-label" *ngIf="step.type === 'break'">{{ i18n.t('settings.send_ctrlc') }}</span>
        <span class="qc-step-del" (click)="removeStep(i)">&#x2715;</span>
      </div>
      <div class="qc-step-actions">
        <span class="qc-step-add" (click)="addStep()">+ {{ i18n.t('settings.add_step') }}</span>
        <span class="qc-step-add qc-step-add-break" (click)="addBreakStep()">+ {{ i18n.t('settings.add_break') }}</span>
      </div>

      <div class="qc-edit-field" style="margin-top:8px;">
        <label>{{ i18n.t('settings.group') }}</label>
        <select class="qc-edit-input" [(ngModel)]="editCmd.group">
          <option value="">{{ i18n.t('app.ungrouped') }}</option>
          <ng-container *ngFor="let g of allGroups">
            <option *ngIf="g.name" [value]="g.name">{{ g.name }}</option>
          </ng-container>
        </select>
      </div>
      <div class="qc-edit-check">
        <label><input type="checkbox" [(ngModel)]="editCmd.appendCR"> {{ i18n.t('settings.append_cr') }}</label>
        <label><input type="checkbox" [(ngModel)]="editCmd.pinned"> {{ i18n.t('settings.pinned') }}</label>
        <label><input type="checkbox" [(ngModel)]="editCmd.confirmBeforeRun"> {{ i18n.t('settings.confirm_before_run') }}</label>
      </div>
      <div class="qc-usage-row" *ngIf="editCmd?.id && editCmd?.usageCount !== undefined">
        <span class="qc-usage-label">{{ i18n.t('settings.usage_count') }}: <strong>{{ editCmd.usageCount || 0 }}</strong></span>
        <span class="qc-usage-reset" (click)="onResetUsage()">{{ i18n.t('settings.reset') }}</span>
      </div>
      <div class="qc-edit-footer">
        <button class="qc-edit-btn qc-edit-btn-primary" (click)="saveEditCmd()">{{ i18n.t('settings.save') }}</button>
        <button class="qc-edit-btn" (click)="closeEditModal()">{{ i18n.t('settings.cancel') }}</button>
      </div>
    </div>

    <!-- 执行前确认：命令勾选了「执行时确认」时，点执行先弹此框（点遮罩或取消 = 放弃） -->
    <div class="qc-overlay" *ngIf="pendingConfirmCmd" (click)="cancelPendingRun()"></div>
    <div class="qc-edit-modal qc-confirm-modal" *ngIf="pendingConfirmCmd" (click)="$event.stopPropagation()">
      <div class="qc-edit-title">{{ i18n.t('confirm.title') }}</div>
      <div class="qc-confirm-text">{{ i18n.t('confirm.message') }}</div>
      <pre class="qc-confirm-cmd">{{ pendingConfirmPreview }}</pre>
      <div class="qc-edit-footer">
        <button class="qc-edit-btn" (click)="cancelPendingRun()">{{ i18n.t('settings.cancel') }}</button>
        <button class="qc-edit-btn qc-edit-btn-primary" (click)="confirmPendingRun()">{{ i18n.t('confirm.run') }}</button>
      </div>
    </div>

    <!-- 参数输入弹窗 -->
    <div class="qc-overlay" *ngIf="showParamModal" (click)="closeParamModal()"></div>
    <div class="qc-edit-modal" *ngIf="showParamModal" (click)="$event.stopPropagation()">
      <div class="qc-edit-title">{{ paramModalCmd?.name || i18n.t('panel.param_hint') }}</div>
      <div class="qc-edit-field" *ngFor="let p of paramModalParams">
        <label>{{ p }}</label>
        <input class="qc-edit-input" type="text" [(ngModel)]="paramModalValues[p]"
          (keydown.enter)="confirmParamModal()" [placeholder]="i18n.t('panel.param_hint') + ': ' + p" autofocus>
      </div>
      <div class="qc-edit-footer">
        <button class="qc-edit-btn qc-edit-btn-primary" (click)="confirmParamModal()">{{ i18n.t('settings.ok') }}</button>
        <button class="qc-edit-btn" (click)="closeParamModal()">{{ i18n.t('settings.cancel') }}</button>
      </div>
    </div>

    <!-- 分组修改弹窗 -->
    <div class="qc-overlay" *ngIf="showGroupRename" (click)="closeGroupRename()"></div>
    <div class="qc-edit-modal qc-group-modal" *ngIf="showGroupRename" (click)="$event.stopPropagation()" (keydown)="$event.stopPropagation()">
      <div class="qc-group-modal-title">
        <span>{{ groupRenameIsNew ? i18n.t('group.add') : i18n.t('group.edit') }}</span>
      </div>

      <div class="qc-group-form-row">
        <div class="qc-group-form-col qc-group-form-name">
          <label class="qc-group-form-label">{{ i18n.t('group.name') }}</label>
          <input class="qc-edit-input" type="text" [(ngModel)]="groupRenameValue"
            (keydown.enter)="confirmGroupRename()" [placeholder]="i18n.t('group.name')" autofocus>
        </div>
        <div class="qc-group-form-col qc-group-form-order">
          <label class="qc-group-form-label">{{ i18n.t('group.order') }}</label>
          <input class="qc-edit-input" type="number" min="0" step="1" [(ngModel)]="groupRenameOrder"
            (keydown.enter)="confirmGroupRename()" placeholder="0">
        </div>
      </div>

      <div class="qc-group-form-section" *ngIf="availableProfiles.length > 0">
        <div class="qc-group-profiles-header">
          <label class="qc-group-form-label">{{ i18n.t('group.profiles') }}</label>
          <span class="qc-group-profiles-toggle"
            (click)="toggleAllProfiles(groupRenameProfileIds.length < availableProfiles.length)">
            {{ groupRenameProfileIds.length >= availableProfiles.length ? '\u2715 \u5168\u90E8\u53D6\u6D88' : '\u2714 \u5168\u90E8\u9009\u4E2D' }}
          </span>
        </div>
        <div class="qc-group-profiles-list">
          <div class="qc-group-profile-row" *ngFor="let p of availableProfiles; let pi = index"
            [class.selected]="groupRenameProfileIds.includes(p.id)"
            [class.last]="pi === availableProfiles.length - 1"
            (click)="toggleGroupProfile(p.id, !groupRenameProfileIds.includes(p.id))">
            <input type="checkbox"
              [ngModel]="groupRenameProfileIds.includes(p.id)"
              (ngModelChange)="toggleGroupProfile(p.id, $event)"
              [ngModelOptions]="{standalone: true}"
              (click)="$event.stopPropagation()">
            <div class="qc-group-profile-body">
              <span class="qc-group-profile-name">{{ p.name }}</span>
              <span class="qc-group-profile-conn" *ngIf="p.host">{{ p.host }}<ng-container *ngIf="p.port > 0">:{{ p.port }}</ng-container></span>
            </div>
          </div>
        </div>
        <div class="qc-group-profiles-footer">
          <span class="qc-group-profiles-count" *ngIf="groupRenameProfileIds.length > 0">
            {{ groupRenameProfileIds.length }} / {{ availableProfiles.length }} {{ i18n.t('group.profiles_selected') }}
          </span>
          <span class="qc-group-profiles-hint" *ngIf="groupRenameProfileIds.length === 0">
            {{ i18n.t('group.profiles_hint') }}
          </span>
        </div>
      </div>

      <div class="qc-group-form-section qc-group-form-empty" *ngIf="availableProfiles.length === 0">
        <span class="qc-empty-hint">{{ i18n.t('group.no_profiles') }}</span>
      </div>

      <div class="qc-edit-footer qc-group-footer">
        <button class="qc-edit-btn qc-edit-btn-primary" (click)="confirmGroupRename()">{{ i18n.t('settings.ok') }}</button>
        <button class="qc-edit-btn" (click)="closeGroupRename()">{{ i18n.t('settings.cancel') }}</button>
      </div>
    </div>

    <!-- 多步命令提示弹窗 -->
    <div class="qc-overlay" *ngIf="showMultiStepHint" (click)="cancelMultiStepHint()"></div>
    <div class="qc-edit-modal" *ngIf="showMultiStepHint" (click)="$event.stopPropagation()" style="max-width:320px;">
      <div class="qc-edit-title">{{ i18n.t('panel.multi_step_title') }}</div>
      <div class="qc-edit-field">
        <p style="font-size:calc(var(--qc-font-size, 14px) - 1px); color:var(--_text); line-height:1.5;">{{ i18n.t('panel.multi_step_hint', { count: multiStepCount }) }}</p>
      </div>
      <div class="qc-edit-footer">
        <button class="qc-edit-btn qc-edit-btn-primary" (click)="confirmMultiStepJoin()">{{ i18n.t('settings.ok') }}</button>
        <button class="qc-edit-btn" (click)="cancelMultiStepHint()">{{ i18n.t('settings.cancel') }}</button>
      </div>
    </div>

    <!-- #14 修复：自定义确认弹窗（替代原生 confirm） -->
    <div class="qc-overlay" *ngIf="showConfirmModal" (click)="cancelConfirmModal()"></div>
    <div class="qc-edit-modal" *ngIf="showConfirmModal" (click)="$event.stopPropagation()" style="max-width:320px;">
      <div class="qc-edit-title">{{ confirmModalTitle }}</div>
      <div class="qc-edit-footer">
        <button class="qc-edit-btn qc-edit-btn-danger" (click)="doConfirmModal()">{{ i18n.t('settings.ok') }}</button>
        <button class="qc-edit-btn" (click)="cancelConfirmModal()">{{ i18n.t('settings.cancel') }}</button>
      </div>
    </div>
  `,
  styles: [`
    :host { display: contents; }
    /* 颜色主题变量放在 :host 上，确保面板内所有弹窗（如 .qc-edit-modal）都能继承 */
    :host {
      /* Auto（默认）回退色对齐 SFTP+ 的 Dark 预设：低饱和中性灰。
         原先用 Catppuccin 亮紫值（surface #313244 / hover #585b70 / primary #b4befe）会让面板
         比终端底色亮一档且整体泛紫，与 SFTP+ 的观感差很多。 */
      --_bg: var(--qc-bg, #1a1d23);
      --_text: var(--qc-text, #e8edf5);
      --_primary: var(--qc-primary, #b6b6c3);
      /* 强调色（开/关态图标、可点击文字、hover 反馈）：优先用户自选主色，其次取宿主 Tabby 主色。
         大面积色系已对齐 SFTP+ 的中性灰，但「强调」若也用灰白则完全看不出（图钉的开/关几乎无差别） */
      --_accent: var(--qc-primary, var(--primary-color, #b6b6c3));
      --_border: var(--qc-border, #2d3242);
      --_surface: var(--qc-surface, #252830);
      --_hover: var(--qc-hover, #2d3242);
      --_input-bg: var(--qc-input-bg, #1a1d23);
      --_text-muted: var(--qc-text-muted, #5a5f6f);
      --_text-secondary: #a6adc8;
      --_warning: #fab387;
    }
    .qc-panel {
      position: fixed;
      /* z-index 改为由 qc-terminal-decorator 通过共享计数器动态设置，避免硬编码压盖其它浮动面板 */
      width: 320px;
      box-sizing: border-box;
      background: var(--_bg);
      border: 0.5px solid var(--_border);
      border-radius: 10px;
      overflow: hidden;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
      display: flex;
      flex-direction: column;
      user-select: none;
      font-size: var(--qc-font-size, 14px);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      /* 面板整体透明度，由设置页写入 --_panel-opacity（0.5–1） */
      opacity: var(--_panel-opacity, 1);
    }
    .qc-panel.minimized {
      width: auto;
      height: auto;
      box-shadow: none;
    }
    /* 调整大小手柄 */
    /* 四边四角 resize 手柄：加大命中区 + 提升层级。
       原为边 6px / 角 12px、z-index 1~2，footer 与列表滚动条会吞掉靠边点击 ⇒ 角落常拖不动。
       边条两端各缩进 8px，把角落让给角手柄，避免两者抢事件。 */
    .qc-resize-e, .qc-resize-w { position:absolute; top:8px; bottom:8px; width:8px; cursor:ew-resize; z-index:6; }
    .qc-resize-e { right:0; }
    .qc-resize-w { left:0; }
    .qc-resize-s, .qc-resize-n { position:absolute; left:8px; right:8px; height:8px; cursor:ns-resize; z-index:6; }
    .qc-resize-s { bottom:0; }
    .qc-resize-n { top:0; }
    .qc-resize-se, .qc-resize-sw, .qc-resize-ne, .qc-resize-nw { position:absolute; width:16px; height:16px; z-index:7; }
    .qc-resize-se { right:0; bottom:0; cursor:nwse-resize; }
    .qc-resize-sw { left:0; bottom:0; cursor:nesw-resize; }
    .qc-resize-ne { right:0; top:0; cursor:nesw-resize; }
    .qc-resize-nw { left:0; top:0; cursor:nwse-resize; }
    /* 标题栏 */
    .qc-titlebar {
      display: flex;
      align-items: center;
      padding: 6px 10px;
      background: var(--_surface, #45475a);
      cursor: move;
      flex-shrink: 0;
    }
    .qc-title { font-weight: 500; font-size: 1em; color: var(--_text, #e8edf5); }
    .qc-ssh-label { margin-left: 8px; font-size: .85em; color: var(--_text-muted, #5a5f6f); }
    .qc-title-actions { margin-left: auto; display: flex; gap: 4px; }
    .qc-action {
      cursor: pointer; padding: 2px 5px; font-size: 14px; line-height:1;
      color: var(--_text-muted, #5a5f6f); border-radius: 4px;
    }
    .qc-action:hover { background: rgba(255,255,255,0.1); color: var(--_text, #e8edf5); }
    .qc-action-close:hover { background: rgba(255,0,0,0.3); color: #f38ba8; }
    .qc-action-pin, .qc-action-settings, .qc-action-sort { display:flex; align-items:center; justify-content:center; width:20px; height:20px; padding:0; }
    .qc-action-pin svg, .qc-action-settings svg, .qc-action-sort svg { width:14px; height:14px; }
    /* 开/关态：强调色 + 淡底双重区分（只改颜色时，灰白强调色在深底上几乎看不出差异） */
    .qc-action-pin.active, .qc-action-sort.active {
      color: var(--_accent, #b6b6c3);
      background: rgba(127,127,127,0.22);
      border-radius: 4px;
    }
    .qc-action-pin:hover, .qc-action-settings:hover, .qc-action-sort:hover { background: rgba(255,255,255,0.1); }
    /* active 自带 hover 版本：通用 :hover 与 .active 特异性相同（0,2,0），只靠文件顺序会让淡底在悬停时消失 */
    .qc-action-pin.active:hover, .qc-action-sort.active:hover {
      color: var(--_accent, #b6b6c3);
      background: rgba(127,127,127,0.34);
    }
    /* 搜索栏 */
    .qc-search {
      /* 必须是 visible：分组下拉是绝对定位浮层，需要溢出搜索行才能显示；
         原来这里是 hidden，会把下拉菜单整条裁掉（只剩几像素，看起来像「点了没反应」） */
      padding: 6px 10px; flex-shrink: 0; overflow: visible;
    }
    .qc-search-row {
      display:flex; gap:4px; align-items:center; min-width:0;
    }
    /* 输入框容器：让清除按钮可以绝对定位到框内 */
    .qc-search-field { position:relative; flex:1; min-width:0; display:flex; }
    .qc-search-input {
      flex:1; width:100%; height:30px; padding: 0 24px 0 8px; min-width:0; box-sizing:border-box;
      background: var(--_input-bg, #1a1d23);
      border: 0.5px solid var(--_border, #2d3242);
      border-radius: 6px;
      color: var(--_text, #e8edf5); font-size: var(--qc-font-size, 14px); outline: none; caret-color:var(--_text);
    }
    .qc-search-input::placeholder { color: var(--_text-muted, #5a5f6f); }
    /* ✕ 置于输入框内部右端（padding-right 已留出 24px 空间） */
    .qc-search-clear {
      position:absolute; right:6px; top:50%; transform:translateY(-50%);
      cursor:pointer; color:var(--_text-muted,#5a5f6f); line-height:1; padding:0 2px;
      font-size: calc(var(--qc-font-size, 14px) - 1px);
    }
    .qc-search-clear:hover { color: var(--_text, #e8edf5); }

    /* 分组筛选 */
    /* 分组筛选（自绘下拉）：原生 <select> 在 Electron 无边框窗口下点不开，改用面板内浮层 */
    .qc-filter { position:relative; flex-shrink:0; }
    .qc-filter-btn {
      display:flex; align-items:center; gap:4px; height:30px; max-width:160px; padding:0 8px; box-sizing:border-box;
      border-radius:6px; background:var(--_input-bg,#1a1d23); border:0.5px solid var(--_border,#2d3242);
      color:var(--_text,#e8edf5); font-size:var(--qc-font-size,14px); cursor:pointer; user-select:none;
    }
    .qc-filter-btn:hover { background:var(--_hover,#2d3242); }
    .qc-filter-text { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .qc-filter-caret { font-size:10px; line-height:1; color:var(--_text-muted,#5a5f6f); flex-shrink:0; }
    .qc-filter-menu {
      position:absolute; top:calc(100% + 4px); left:0; min-width:168px; max-width:240px; max-height:180px;
      overflow-y:auto; padding:4px; z-index:40;
      /* 浮层比面板底（--_bg）亮一档，形成层次感；再配柔和投影 */
      background:var(--_surface,#252830); border:0.5px solid var(--_border,#2d3242); border-radius:8px;
      box-shadow:0 10px 28px rgba(0,0,0,.5), 0 0 0 .5px rgba(255,255,255,.04);
      animation: qc-menu-in .08s ease-out;
    }
    @keyframes qc-menu-in { from { opacity:0; transform:translateY(-2px); } to { opacity:1; transform:none; } }
    /* 细滚动条：系统默认滚动条在深色小浮层上又粗又亮，是"丑"的主要来源 */
    .qc-filter-menu::-webkit-scrollbar { width:8px; }
    .qc-filter-menu::-webkit-scrollbar-track { background:transparent; }
    .qc-filter-menu::-webkit-scrollbar-thumb {
      background:rgba(255,255,255,.14); border-radius:4px;
      border:2px solid transparent; background-clip:padding-box;
    }
    .qc-filter-menu::-webkit-scrollbar-thumb:hover { background:rgba(255,255,255,.26); background-clip:padding-box; }
    .qc-filter-item {
      position:relative; padding:6px 10px; border-radius:6px; font-size:var(--qc-font-size,14px);
      color:var(--_text,#e8edf5); cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    .qc-filter-item:hover { background:var(--_hover,#2d3242); }
    /* 选中项：强调色文字 + 淡底 + 左侧竖条（只变色在深底上不够明显） */
    .qc-filter-item.active { color:var(--_accent,#b6b6c3); background:rgba(127,127,127,.14); }
    .qc-filter-item.active::before {
      content:''; position:absolute; left:3px; top:7px; bottom:7px; width:2px;
      border-radius:1px; background:var(--_accent,#b6b6c3);
    }
    /* 快捷入口 */
    .qc-quick-bar {
      display: flex; gap: 4px; padding: 0 10px 6px; flex-shrink: 0;
      overflow-x: auto;
    }
    .qc-quick-cmd {
      position:relative; flex-shrink: 0; padding: 3px 16px 3px 10px; border-radius: 6px;
      background: var(--_surface, #e5e7eb);
      border: 0.5px solid var(--_primary, #b6b6c3);
      cursor: pointer; white-space: nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px;
    }
    /* 芯片上的 ✕：hover 才显示，直接取消固定（免去回列表里找星标） */
    /* 芯片上的 ✕：悬停 600ms 后才显形，避免鼠标滑过时误点直接把命令取消固定。
       注意 opacity:0 的元素仍可点击 ⇒ 必须同时用 visibility 延迟隐藏，
       否则「看不见但点得到」正是误操作的根源。 */
    .qc-quick-remove {
      position:absolute; right:3px; top:50%; transform:translateY(-50%);
      font-size:10px; line-height:1; color:var(--_text-muted,#5a5f6f);
      padding:1px 2px; border-radius:3px;
      opacity:0; visibility:hidden;
      /* 移出时立即隐藏 */
      transition: opacity .12s ease, visibility 0s linear 0s;
    }
    .qc-quick-cmd:hover .qc-quick-remove {
      opacity:1; visibility:visible;
      /* 悬停 600ms 后再显形（含淡入 120ms，约 0.72s 后完全可见） */
      transition: opacity .12s ease .6s, visibility 0s linear .6s;
    }
    .qc-quick-remove:hover { color:#e24b4a; background:rgba(226,75,74,0.15); }
    .qc-quick-cmd:hover { background: var(--_hover, #2d3242); }
    /* 快捷入口拖拽排序：源条目半透明，落点用竖向 3px 线表示（横向布局，故线与列表的横线区分开） */
    .qc-quick-cmd.dragging { opacity: .4; }
    .qc-quick-cmd.drag-over-left { box-shadow: -3px 0 0 0 var(--_primary, #b6b6c3); }
    .qc-quick-cmd.drag-over-right { box-shadow: 3px 0 0 0 var(--_primary, #b6b6c3); }
    .qc-quick-name { font-size: var(--qc-font-size, 14px); color: var(--_text, #e8edf5); font-weight: 500; }
    /* 命令列表 */
    .qc-list {
      flex: 1; overflow-y: auto; overflow-x: hidden;
      padding: 2px 0; min-width:0;
    }
    .qc-group-header {
      display: flex; align-items: center; gap: 4px; padding: 4px 10px 4px 6px;
      cursor: pointer; font-size: .92em;
      box-sizing: border-box; width: 100%;
    }
    .qc-group-header:hover { background: var(--_hover, rgba(255,255,255,0.05)); }
    .qc-group-header.drag-over { border-top: 2px solid var(--_primary, #b6b6c3); }
    .qc-group-header.drag-over-bottom { border-bottom: 2px solid var(--_primary, #b6b6c3); }
    .qc-group-arrow { font-size: calc(var(--qc-font-size, 14px) - 2px); color: var(--_text-muted, #5a5f6f); width: 16px; flex-shrink:0; text-align:center; }
    .qc-group-name { font-weight: 500; color: var(--_text-secondary, #a6adc8); }
    .qc-group-count { color: var(--_text-muted, #5a5f6f); font-size: calc(var(--qc-font-size, 14px) - 2px); }
    .qc-group-add {
      margin-left: auto; cursor: pointer; font-size: var(--qc-font-size, 14px); font-weight: 600;
      color: var(--_text, #e8edf5); opacity:1; padding: 0 4px; line-height: 1;
      border-radius: 3px; visibility: hidden;
    }
    .qc-group-header:hover .qc-group-add { visibility: visible; }
    .qc-group-add:hover { color: var(--_on-primary, #1e1e2e); background: var(--_primary, #b6b6c3); }
    .qc-group-edit {
      cursor: pointer; font-size: var(--qc-font-size, 14px); color: var(--_text, #e8edf5); opacity:1;
      padding: 0 3px; border-radius: 3px; visibility: hidden;
    }
    .qc-group-header:hover .qc-group-edit { visibility: visible; }
    .qc-group-edit:hover { color: var(--_on-primary, #1e1e2e); background: var(--_primary, #b6b6c3); }
    .qc-group-del { cursor:pointer; font-size:var(--qc-font-size, 14px); color:var(--_text, #e8edf5); opacity:1; padding:0 3px; border-radius:3px; visibility:hidden; }
    .qc-group-header:hover .qc-group-del { visibility:visible; }
    .qc-group-del:hover { color:#fff; background:#e24b4a; }
    /* 命令行 */
    .qc-cmd-row {
      display: flex; align-items: center; gap: 4px;
      padding: 7px 10px 7px 6px; cursor: pointer; border-radius: 0;
      width: 100%; box-sizing: border-box; overflow: hidden;
    }
    .qc-cmd-row:hover, .qc-cmd-row.highlighted { background: var(--_hover, rgba(255,255,255,0.1)); }
    .qc-cmd-row { position: relative; }
    /* 拖拽位置指示线：使用绝对定位，不影响布局 */
    .qc-cmd-row.drag-over::before,
    .qc-cmd-row.drag-over-bottom::after {
      content: '';
      position: absolute;
      left: 0; right: 0; height: 3px;
      background: var(--_primary, #b6b6c3);
      border-radius: 2px;
      z-index: 10;
      pointer-events: none;
    }
    .qc-cmd-row.drag-over::before { top: -1px; }
    .qc-cmd-row.drag-over-bottom::after { bottom: -1px; }
    .qc-cmd-row.dragging { opacity: 0.4; }
    /* 拖拽时禁用 hover 背景色，防止重绘导致抖动 */
    .qc-list.is-dragging .qc-cmd-row:hover { background: transparent !important; }
    .qc-cmd-group-body { position:relative; overflow-x: hidden; width: 100%; max-width: 100%; box-sizing: border-box; }
    /* 宽而矮：命令用 grid auto-fill 自动分列（每列 ≥240px），面板越宽列数越多，横向空间用满。
       不用 column-count —— 固定高度的滚动容器里多列会向右溢出而不是纵向滚动。 */
    .qc-list[data-cols="multi"] .qc-cmd-group-body {
      display:grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      column-gap:8px; align-content:flex-start;
    }
    .qc-list[data-cols="multi"] .qc-cmd-body { min-width:0; }
    .qc-list[data-cols="multi"] .qc-cmd-group-body > .qc-drop-end { grid-column: 1 / -1; }
    /* 列表末尾的追加（drop）区：只保留不可见的命中区，用于把命令拖到最末尾 / 空分组。
       刻意不画任何指示线 —— 无论实心长条还是虚线，都会被误认成横向滚动条或多余装饰。 */
    .qc-drop-end { height:8px; margin:0; background:transparent; }
    .qc-drop-end.drag-over { background:transparent; }
    .qc-cmd-drag {
      font-size: 11px; color: var(--_text-muted, #5a5f6f); cursor: grab; flex-shrink: 0;
      width: 14px; text-align: center; user-select: none;
    }
    .qc-cmd-drag:active { cursor: grabbing; }
    .qc-cmd-icon { font-size: 8px; flex-shrink: 0; width: 10px; overflow: hidden; text-align: center; }
    .qc-cmd-body { flex: 1; min-width: 0; overflow: hidden; }
    .qc-cmd-name { display: block; font-size: .92em; color: var(--_text, #e8edf5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .qc-cmd-preview { display: block; font-size: .77em; color: var(--_text-muted, #5a5f6f); font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .qc-cmd-badge { font-size: calc(var(--qc-font-size, 14px) - 3px); padding: 1px 4px; border-radius: 3px; background: var(--_warning, #fab387); color: #1e1e2e; }
    .qc-cmd-shortcut-badge { font-size: calc(var(--qc-font-size, 14px) - 3px); padding: 1px 4px; border-radius: 3px; background: var(--_surface, #45475a); color: var(--_text-muted, #5a5f6f); font-family: monospace; }
    .qc-cmd-execute { font-size: calc(var(--qc-font-size, 14px) + 1px); color: var(--_text, #e8edf5); cursor: pointer; }
    .qc-cmd-edit-btn { font-size: var(--qc-font-size, 14px); color: var(--_text, #e8edf5); cursor: pointer; margin-right: 2px; }
    .qc-cmd-row:hover .qc-cmd-pinbtn { visibility:visible; opacity:1; }
    .qc-cmd-edit-btn:hover { color: var(--_accent, #b6b6c3); }
    .qc-cmd-execute:hover { color: var(--_accent, #b6b6c3); }
    .qc-cmd-sendline { font-size: var(--qc-font-size, 14px); color: var(--_text, #e8edf5); cursor: pointer; padding: 0 1px; }
    .qc-cmd-sendline:hover { color: var(--_accent, #b6b6c3); }
    .qc-cmd-pinbtn { font-size: var(--qc-font-size, 14px); cursor: pointer; flex-shrink: 0; padding: 0 3px; color: var(--_text, #e8edf5); visibility:hidden; opacity:0; transition:opacity .12s; }
    .qc-cmd-pinbtn:hover { color: var(--_accent, #b6b6c3); }
    .qc-cmd-pinbtn.active { color: var(--_accent, #b6b6c3); visibility:visible; opacity:1; }
    .qc-cmd-del { font-size: var(--qc-font-size, 14px); color: var(--_text, #e8edf5); cursor: pointer; padding:0 2px; }
    .qc-cmd-del:hover { color:#e24b4a; }
    /* 右侧操作按钮容器：默认收起不占宽度，hover 展开 */
    .qc-cmd-actions {
      display: flex; gap: 4px; flex-shrink: 0;
      max-width: 0; min-width: 0; width: 0; overflow: hidden; opacity: 0;
      transition: max-width .12s ease, opacity .12s ease;
    }
    .qc-cmd-row:hover .qc-cmd-actions { max-width: 200px; width: auto; opacity: 1; }
    /* 拖拽时强制收起操作按钮，防止多个行同时展开导致横向溢出 */
    .qc-cmd-row.dragging .qc-cmd-actions,
    .qc-list.is-dragging .qc-cmd-actions {
      max-width: 0 !important; min-width: 0 !important; width: 0 !important; opacity: 0 !important;
      transition: none !important;
      display: none !important;
    }
    .qc-list.is-dragging .qc-cmd-pinbtn:not(.active) {
      visibility: hidden !important; opacity: 0 !important;
    }
    /* 空状态 */
    .qc-empty { padding: 20px; text-align: center; color: var(--_text-muted, #5a5f6f); font-size: var(--qc-font-size, 14px); }
    /* 底部 */
    .qc-footer {
      display: flex; align-items: center; padding: 4px 10px;
      border-top: 0.5px solid var(--_border, #45475a); flex-shrink: 0;
    }
    .qc-add-btn { font-size: var(--qc-font-size, 14px); color: var(--_accent, #b6b6c3); cursor: pointer; padding: 2px 4px; }
    .qc-add-btn:hover { text-decoration: underline; }
    .qc-add-group-btn { margin-left: 8px; font-size: var(--qc-font-size, 14px); color: var(--_text-muted, #5a5f6f); }
    .qc-add-group-btn:hover { text-decoration: underline; color: var(--_accent, #b6b6c3); }
    .qc-usage-hint { margin-left: auto; font-size: calc(var(--qc-font-size, 14px) - 2px); color: var(--_text-muted, #5a5f6f); }

    /* 编辑弹窗 */
    /* 模态层：必须高于面板内所有浮层（分组下拉 40、缩放手柄 7 等），
       并给「后出现的确认框」留出更高一档（2002 > 2001），避免后弹的框被先弹的盖住 */
    .qc-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:2000; }
    .qc-edit-modal {
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
      background:var(--_bg); border:0; border-radius:12px; padding:20px; z-index:2001;
      min-width:580px; max-width:90%;
      box-shadow:0 12px 48px rgba(0,0,0,0.4);
    }
    .qc-edit-title { font-weight:500; font-size:calc(var(--qc-font-size, 14px) + 1px); color:var(--_text); margin-bottom:12px; display:flex; align-items:center; gap:8px; }
    .qc-usage-badge { font-size:calc(var(--qc-font-size, 14px) - 3px); opacity:.5; font-weight:400; }
    .qc-usage-row { display:flex; align-items:center; gap:8px; margin-top:8px; font-size:calc(var(--qc-font-size, 14px) - 2px); color:var(--_text-muted); }
    .qc-usage-label strong { color:var(--_text); }
    .qc-usage-reset { cursor:pointer; color:var(--_warning); font-size:calc(var(--qc-font-size, 14px) - 2px); padding:1px 6px; border-radius:4px; }
    .qc-usage-reset:hover { background:rgba(250,179,135,0.12); }
    .qc-edit-field { margin-bottom:8px; }
    .qc-edit-field label { display:block; font-size:calc(var(--qc-font-size, 14px) - 2px); color:var(--_text-muted); margin-bottom:3px; }
    .qc-edit-input {
      width:100%; padding:7px 8px; border-radius:6px; box-sizing:border-box;
      background:var(--_input-bg); border:0.5px solid var(--_border);
      color:var(--_text); font-size:var(--qc-font-size, 14px); outline:none; caret-color:var(--_text);
    }
    .qc-edit-input:focus { border-color:var(--_accent); }
    .qc-edit-footer { display:flex; gap:6px; justify-content:flex-end; margin-top:12px; }
    /* 执行前确认弹窗 */
    /* 执行前确认弹窗：比编辑弹窗再高一层；min-width 必须归零，
       否则基础 .qc-edit-modal 的 min-width:580px 会压过 max-width:340px（min 优先） */
    .qc-confirm-modal { min-width: 0; max-width: 340px; z-index: 2002; }
    .qc-confirm-text { font-size: calc(var(--qc-font-size, 14px) - 1px); color: var(--_text-muted, #5a5f6f); margin: 2px 0 8px; }
    .qc-confirm-cmd {
      margin: 0 0 12px; padding: 8px 10px; max-height: 160px; overflow: auto;
      background: var(--_input-bg, #1a1d23); border: 0.5px solid var(--_border, #2d3242); border-radius: 6px;
      font-family: monospace; font-size: calc(var(--qc-font-size, 14px) - 2px); color: var(--_text, #e8edf5);
      white-space: pre-wrap; word-break: break-all;
    }
    .qc-confirm-cmd::-webkit-scrollbar { width: 8px; }
    .qc-confirm-cmd::-webkit-scrollbar-track { background: transparent; }
    .qc-confirm-cmd::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,.14); border-radius: 4px;
      border: 2px solid transparent; background-clip: padding-box;
    }

    /* ====== 分组编辑弹窗 ====== */
    .qc-group-modal { max-width: 480px; min-width: 380px; }
    .qc-group-modal-title {
      display: flex; align-items: center; gap: 10px;
      font-weight: 500; font-size: calc(var(--qc-font-size, 14px) + 2px);
      color: var(--_text); margin-bottom: 18px; padding-bottom: 12px;
      border-bottom: 1px solid var(--_border, #2d3242);
    }
    .qc-group-modal-icon { font-size: 18px; opacity: .7; }
    .qc-group-form-row {
      display: flex; gap: 12px; margin-bottom: 6px;
    }
    .qc-group-form-col { display: flex; flex-direction: column; gap: 4px; }
    .qc-group-form-name { flex: 1; }
    .qc-group-form-order { width: 80px; flex-shrink: 0; }
    .qc-group-form-label {
      font-size: calc(var(--qc-font-size, 14px) - 2px);
      color: var(--_text-muted, #5a5f6f); font-weight: 500;
    }
    .qc-group-form-section {
      margin-top: 12px; padding-top: 10px;
      border-top: 1px solid var(--_border, #2d3242);
    }
    .qc-group-form-empty { border-top: none; margin-top: 8px; padding-top: 0; }
    .qc-empty-hint { font-size: calc(var(--qc-font-size, 14px) - 2px); color: var(--_text-muted); }

    /* 配置连接列表 */
    .qc-group-profiles-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 8px;
    }
    .qc-group-profiles-toggle {
      font-size: calc(var(--qc-font-size, 14px) - 2px);
      color: var(--_accent, #b6b6c3); cursor: pointer;
      padding: 2px 6px; border-radius: 4px; white-space: nowrap;
      user-select: none;
    }
    .qc-group-profiles-toggle:hover { background: rgba(180,190,254,0.1); }
    .qc-group-profiles-list {
      max-height: 240px; overflow-y: auto;
      border: 1px solid var(--_border, #2d3242); border-radius: 6px;
      background: var(--_input-bg, #1a1d23);
    }
    .qc-group-profile-row {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 12px; cursor: pointer; user-select: none;
      border-bottom: 0.5px solid var(--_border, #2d3242);
      transition: background .1s;
    }
    .qc-group-profile-row.last { border-bottom: none; }
    .qc-group-profile-row:hover { background: var(--_hover, #2d3242); }
    .qc-group-profile-row.selected { background: rgba(180,190,254,0.06); }
    .qc-group-profile-row input[type="checkbox"] {
      margin: 0; flex-shrink: 0; accent-color: var(--_accent, #b6b6c3);
    }
    .qc-group-profile-body {
      flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px;
    }
    .qc-group-profile-name {
      font-size: calc(var(--qc-font-size, 14px) - 1px);
      color: var(--_text, #e8edf5); font-weight: 500;
    }
    .qc-group-profile-conn {
      font-size: calc(var(--qc-font-size, 14px) - 3px);
      color: var(--_text-muted, #5a5f6f); font-family: monospace;
    }
    .qc-group-profiles-count {
      font-size: calc(var(--qc-font-size, 14px) - 2px);
      color: var(--_accent, #b6b6c3);
    }
    .qc-group-profiles-list::-webkit-scrollbar { width: 5px; }
    .qc-group-profiles-list::-webkit-scrollbar-track { background: transparent; }
    .qc-group-profiles-list::-webkit-scrollbar-thumb { background: var(--_border); border-radius: 3px; }

    .qc-group-profiles-footer { margin-top: 6px; }
    .qc-group-profiles-hint {
      font-size: calc(var(--qc-font-size, 14px) - 2px);
      color: var(--_text-muted, #5a5f6f);
    }
    .qc-group-footer { margin-top: 16px; padding-top: 10px; border-top: 1px solid var(--_border, #2d3242); }
    .qc-edit-check { display:flex; gap:12px; margin-top:8px; }
    .qc-edit-check label { display:flex; align-items:center; gap:4px; font-size:var(--qc-font-size, 14px); color:var(--_text); cursor:pointer; }
    .qc-edit-check input { margin:0; }

    /* 命令步骤列表 */
    .qc-steps-label { font-size:calc(var(--qc-font-size, 14px) - 1px); font-weight:500; color:var(--_text-muted); margin-bottom:4px; margin-top:8px; }
    .qc-step-row { display:flex; gap:4px; align-items:center; margin-bottom:3px; }
    .qc-step-row.dragging { opacity: 0.4; }
    .qc-step-row.drag-over { border-top: 2px solid var(--_primary, #b6b6c3); }
    .qc-step-row.drag-over-bottom { border-bottom: 2px solid var(--_primary, #b6b6c3); }
    .qc-step-row.qc-step-disabled { opacity:0.45; }
    .qc-step-row.qc-step-disabled .qc-step-input,
    .qc-step-row.qc-step-disabled .qc-step-delay { color:var(--_text-muted); }
    .qc-step-enabled { margin:0; cursor:pointer; flex-shrink:0; }
    .qc-step-drag { font-size:var(--qc-font-size, 14px); color:var(--_text-muted); cursor:grab; flex-shrink:0; width:16px; text-align:center; user-select:none; }
    .qc-step-drag:active { cursor:grabbing; }
    .qc-step-type { font-size:var(--qc-font-size, 14px); cursor:pointer; flex-shrink:0; padding:1px 4px; border-radius:3px; color:var(--_accent); }
    .qc-step-type.is-break { color:#fab387; background:rgba(250,179,135,0.12); }
    .qc-step-type:hover { background:rgba(255,255,255,0.08); }
    .qc-step-input {
      flex:1; padding:7px 8px; border-radius:6px; box-sizing:border-box;
      background:var(--_input-bg); border:0.5px solid var(--_border);
      color:var(--_text); font-size:var(--qc-font-size, 14px); outline:none; resize:none;
      overflow:hidden; min-height:28px; field-sizing:content; caret-color:var(--_text);
    }
    .qc-step-input:focus { border-color:var(--_accent); }
    .qc-step-delay {
      width:64px; padding:7px 4px; border-radius:6px; box-sizing:border-box; flex-shrink:0;
      background:var(--_input-bg); border:0.5px solid var(--_border);
      color:var(--_text-muted); font-size:calc(var(--qc-font-size, 14px) - 2px); outline:none; text-align:center;
    }
    .qc-step-delay:focus { border-color:var(--_accent); color:var(--_text); }
    .qc-step-del {
      flex-shrink:0; cursor:pointer; color:var(--_text-muted); font-size:calc(var(--qc-font-size, 14px) - 1px); padding:2px 6px; border-radius:4px;
    }
    .qc-step-del:hover { color:#e24b4a; background:rgba(226,75,74,0.12); }
    .qc-step-break-label { font-size:var(--qc-font-size, 14px); color:#fab387; font-weight:500; padding:0 4px; flex:1; }
    .qc-step-actions { display:flex; gap:12px; margin-top:2px; }
    .qc-step-add { font-size:var(--qc-font-size, 14px); color:var(--_accent); cursor:pointer; padding:2px 0; }
    .qc-step-add:hover { text-decoration:underline; }
    .qc-step-add-break { color:#fab387; }
    .qc-edit-btn {
      padding:5px 14px; border-radius:6px; border:0.5px solid var(--_border);
      background:var(--_surface); color:var(--_text);
      font-size:var(--qc-font-size, 14px); cursor:pointer;
    }
    .qc-edit-btn:hover { background:var(--_hover); }
    .qc-edit-btn-primary { background:var(--_primary); color:#1e1e2e; border-color:var(--_accent); }
    .qc-edit-btn-primary:hover { opacity:.85; }

    /* 自定义滚动条 */
    .qc-list::-webkit-scrollbar,
    .qc-quick-bar::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    .qc-list::-webkit-scrollbar-track,
    .qc-quick-bar::-webkit-scrollbar-track {
      background: transparent;
    }
    .qc-list::-webkit-scrollbar-thumb,
    .qc-quick-bar::-webkit-scrollbar-thumb {
      background: var(--_border, #2d3242);
      border-radius: 3px;
    }
    .qc-list::-webkit-scrollbar-thumb:hover,
    .qc-quick-bar::-webkit-scrollbar-thumb:hover {
      background: var(--_text-muted, #5a5f6f);
    }
  `],
})
export class QuickCommandFloatingPanel implements OnInit, OnDestroy {
  @ViewChild('listRef') listRef!: ElementRef

  svc: QuickCommandService
  i18n = new QuickCommandI18nService()

  constructor(
    @Optional() configService?: ConfigService,
    @Inject(ElementRef) public elRef: ElementRef = null as any,
  ) {
    this.svc = new QuickCommandService(configService)
  }

  private destroyed = false
  minimized = false
  /** 触发本次打开的终端 hostEl（split 场景下用于判断面板是否落在当前 pane 视野内） */
  terminalHostEl: HTMLElement | null = null
  panelX = 20
  panelY = 60
  /** 面板常驻（开启后执行命令不自动关闭面板） */
  pinPanel = true
  /** 面板整体透明度（0.5–1），默认 1 */
  panelOpacity = 1
  /** 面板宽度，从 localStorage 恢复，默认 320 */
  panelWidth: number = +(localStorage.getItem('qc-plus-panel-width') || '320')
  /** 用户意图宽度（未被 pane 裁剪的原始值）：切换 pane / 拆分比例变化时据此重新裁剪，
   *  避免把「窄 pane 下被压缩的尺寸」当成新基准而越开越小（对齐 SFTP+ 的几何串味修复） */
  private _storedWidth: number = +(localStorage.getItem('qc-plus-panel-width') || '320')
  /** 用户意图高度（0 = 未手动设定，按内容自适应） */
  private _storedHeight: number = +(localStorage.getItem('qc-plus-panel-height') || '0')
  /** 未手动设定高度时的自适应上限：跟随 pane 高度，拆分窄窗下不再固定 420 而溢出 */
  autoMaxHeight = 420
  /** 面板高度，0 表示自动（不固定），拖拽后持久化 */
  panelHeight: number = +(localStorage.getItem('qc-plus-panel-height') || '0')
  private resizing: { dir: string; startW: number; startH: number; lastX: number; lastY: number } | null = null
  private resizeMoveHandler: ((ev: MouseEvent) => void) | null = null
  private resizeUpHandler: (() => void) | null = null
  searchText = ''
  filterGroup = ''
  highlightedId = ''

  commands: QuickCommand[] = []
  groups: QuickCommandGroup[] = []
  filteredCommands: QuickCommand[] = []
  pinnedCommands: QuickCommand[] = []

  sshHost = ''
  terminalRef: any = null
  profileId = ''

  onClose: (() => void) | null = null
  onMinimize: (() => void) | null = null
  /** 面板标题栏齿轮 → 打开 Tabby 设置页（由 decorator 注入回调） */
  onOpenSettings: (() => void) | null = null
  /** 隐藏面板标题栏的设置入口（设置页「功能」开关控制） */
  hideSettingsEntry = false
  /** 排序模式：manual = 拖拽顺序（默认）；name = 按名称；usage = 按执行次数（仅影响显示，不改存储顺序） */
  sortMode: 'manual' | 'name' | 'usage' = 'manual'
  /** 滚动停止后是否把列表吸附到整行（设置页开关，默认关闭） */
  scrollSnapEnabled = false

  private dragging = false
  private dragOffsetX = 0
  private dragOffsetY = 0
  private dragMoveHandler: any = null
  private dragUpHandler: any = null

  get allGroups(): QuickCommandGroup[] {
    return this.groups
  }

  get displayGroups(): QuickCommandGroup[] {
    return this.sortGroups(this.groups.filter(g => {
      // 分组筛选
      if (this.filterGroup === '__ungrouped__') {
        if (g.name !== '') return false
      } else if (this.filterGroup === '__auto__') {
        // 自动模式：仅显示明确分配给当前配置连接的分组
        if (!this.profileId) return true
        if (!g.profileIds || g.profileIds.length === 0) return false
        return g.profileIds.includes(this.profileId)
      } else if (this.filterGroup) {
        if (g.name !== this.filterGroup) return false
      }
      if (this.searchText) {
        const cmds = this.getGroupCommands(g.name)
        return cmds.length > 0
      }
      return true
    }))
  }

  trackGroup(_i: number, g: QuickCommandGroup): string { return g.name || '_ungrouped_' }

  get selectedCount(): number {
    if (this.filterGroup === '__auto__' && this.profileId) {
      return this.filteredCommands.filter(c => {
        const g = this.groups.find(gr => (gr.name || '') === (c.group || ''))
        return !!(g?.profileIds?.length && g.profileIds.includes(this.profileId))
      }).length
    }
    return this.filteredCommands.length
  }

  ngOnInit(): void {
    // 先确定当前连接，再恢复该连接的筛选/搜索（避免 loadData → onSearch 用空值覆盖）
    this.initTerminalInfo()
    this.restoreConnectionFilter()
    this.loadPinPanel()
    this.loadHideSettingsEntry()
    this.loadPanelOpacity()
    this.loadSortMode()
    this.loadScrollSnap()
    this.loadData()
    // Auto 主题按「当前」宿主主题重判一次：插件加载时主题变量可能未注入，判错会让面板颜色与界面不匹配
    try { window.dispatchEvent(new CustomEvent('qc-plus-sync-theme')) } catch { /* ignore */ }
    window.addEventListener('qc-plus-locale-changed', this.onLocaleChanged)
    window.addEventListener('qc-plus-data-changed', this.onDataChanged)
    window.addEventListener('qc-plus-config-changed', this._onConfigChanged)
  }

  /** 面板复用（切换终端）时刷新：重新识别连接并恢复该连接的位置/筛选 */
  applyPositionMemory(): void {
    this.initTerminalInfo()
    this.restoreConnectionFilter()
    this.restorePosition()
    this.loadData()
  }

  /** 恢复当前连接记住的分组筛选 + 搜索词 */
  private restoreConnectionFilter(): void {
    const f = this.svc.getConnectionFilter(this.profileId)
    this.filterGroup = f.filterGroup
    this.searchText = f.searchText
  }

  private initTerminalInfo(): void {
    if (this.terminalRef) {
      try {
        const ssh = this.terminalRef?.sshSession ?? this.terminalRef?._session ?? null
        if (ssh) {
          this.sshHost = ssh.host || ssh.options?.host || ''
          if (this.sshHost) this.sshHost = '@' + this.sshHost
        }
      } catch { /* ignore */ }
    }
    if (!this.profileId && this.terminalRef?.profile?.id) {
      this.profileId = this.terminalRef.profile.id
    }
    if (!this.profileId && this.terminalRef) {
      try {
        const ssh = this.terminalRef?.sshSession ?? this.terminalRef?._session ?? null
        if (ssh?.host) this.profileId = 'ssh:' + ssh.host
      } catch { /* ignore */ }
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true
    this.savePosMemory()
    window.removeEventListener('qc-plus-locale-changed', this.onLocaleChanged)
    window.removeEventListener('qc-plus-data-changed', this.onDataChanged)
    window.removeEventListener('qc-plus-config-changed', this._onConfigChanged)
    this.cleanDrag()
    this.cleanResize()
    if (this._snapTimer) { clearTimeout(this._snapTimer); this._snapTimer = null }
  }

  private onLocaleChanged = (): void => {
    this.i18n = new QuickCommandI18nService()
    this.loadData()
  }

  private _onConfigChanged = (ev: Event): void => {
    const detail = (ev as CustomEvent).detail
    if (detail && typeof detail.pinPanel === 'boolean') {
      this.pinPanel = detail.pinPanel
    }
    if (detail && typeof detail.panelOpacity === 'number') {
      this.panelOpacity = Math.min(1, Math.max(0.5, detail.panelOpacity))
      this._applyPanelOpacity()
    }
    if (detail && typeof detail.hidePanelSettingsEntry === 'boolean') {
      this.hideSettingsEntry = detail.hidePanelSettingsEntry
    }
    if (detail && (detail.sortMode === 'manual' || detail.sortMode === 'name' || detail.sortMode === 'usage')) {
      this.sortMode = detail.sortMode
    }
    if (detail && typeof detail.scrollSnapEnabled === 'boolean') {
      this.scrollSnapEnabled = detail.scrollSnapEnabled
      // 关闭时丢弃可能已排队的吸附，避免开关关掉后仍跳一次
      if (!this.scrollSnapEnabled && this._snapTimer) { clearTimeout(this._snapTimer); this._snapTimer = null }
    }
  }

  /** 从 Tabby 配置加载「面板常驻」设置 */
  loadPinPanel(): void {
    try {
      const cfg = (this.svc as any)._configService?.store?.['tabby-quick-command-plus']
      if (cfg?.pinPanel !== undefined) {
        this.pinPanel = !!cfg.pinPanel
        return
      }
    } catch { /* ignore */ }
    // 回退到 localStorage
    try {
      const raw = localStorage.getItem('qc-plus-pin-panel')
      if (raw !== null) this.pinPanel = raw === 'true'
    } catch { /* ignore */ }
  }

  /** 加载面板整体透明度（config 优先，回退默认值 1） */
  loadPanelOpacity(): void {
    let v = 1
    try {
      const cfg = (this.svc as any)._configService?.store?.['tabby-quick-command-plus']
      if (cfg?.panelOpacity !== undefined) {
        v = Math.min(1, Math.max(0.5, Number(cfg.panelOpacity)))
      }
    } catch { /* ignore */ }
    this.panelOpacity = v
    this._applyPanelOpacity()
  }

  /** 将面板透明度写入 CSS 变量 --_panel-opacity */
  private _applyPanelOpacity(): void {
    const el = this.elRef?.nativeElement as HTMLElement | undefined
    if (!el) return
    el.style.setProperty('--_panel-opacity', String(this.panelOpacity))
  }

  /** 从 Tabby 配置加载「隐藏面板设置入口」设置（回退 localStorage） */
  loadHideSettingsEntry(): void {
    try {
      const cfg = (this.svc as any)._configService?.store?.['tabby-quick-command-plus']
      if (cfg?.hidePanelSettingsEntry !== undefined) {
        this.hideSettingsEntry = !!cfg.hidePanelSettingsEntry
        return
      }
    } catch { /* ignore */ }
    try {
      const raw = localStorage.getItem('qc-plus-hide-entry-settings')
      if (raw !== null) this.hideSettingsEntry = raw === 'true'
    } catch { /* ignore */ }
  }

  /** 当前排序模式的可读名称（按钮 tooltip 用） */
  get sortModeLabel(): string {
    if (this.sortMode === 'name') return this.i18n.t('panel.sort_name')
    if (this.sortMode === 'usage') return this.i18n.t('panel.sort_usage')
    return this.i18n.t('panel.sort_manual')
  }

  /** 循环切换排序模式：拖拽顺序 → 名称 → 执行次数 → 拖拽顺序 */
  cycleSortMode(): void {
    this.sortMode = this.sortMode === 'manual' ? 'name' : (this.sortMode === 'name' ? 'usage' : 'manual')
    try { localStorage.setItem('qc-plus-sort-mode', this.sortMode) } catch { /* ignore */ }
    // 同步到 Tabby 配置（与其它面板偏好一起被备份/导出）
    try {
      const cfg = (this.svc as any)._configService?.store?.['tabby-quick-command-plus']
      if (cfg) { cfg.sortMode = this.sortMode; (this.svc as any)._configService.save() }
    } catch { /* ignore */ }
  }

  /** 加载排序模式（config 优先，回退 localStorage） */
  loadSortMode(): void {
    try {
      const cfg = (this.svc as any)._configService?.store?.['tabby-quick-command-plus']
      const v = cfg?.sortMode
      if (v === 'manual' || v === 'name' || v === 'usage') { this.sortMode = v; return }
    } catch { /* ignore */ }
    try {
      const raw = localStorage.getItem('qc-plus-sort-mode')
      if (raw === 'manual' || raw === 'name' || raw === 'usage') this.sortMode = raw
    } catch { /* ignore */ }
  }

  /** 加载「滚动吸附到整行」开关（config 优先，回退 localStorage；默认关闭） */
  loadScrollSnap(): void {
    try {
      const cfg = (this.svc as any)._configService?.store?.['tabby-quick-command-plus']
      if (typeof cfg?.scrollSnapEnabled === 'boolean') { this.scrollSnapEnabled = cfg.scrollSnapEnabled; return }
    } catch { /* ignore */ }
    try {
      const raw = localStorage.getItem('qc-plus-scroll-snap')
      if (raw !== null) this.scrollSnapEnabled = raw === 'true'
    } catch { /* ignore */ }
  }

  /** 按当前模式重排分组（只影响显示，不改存储顺序） */
  private sortGroups(list: QuickCommandGroup[]): QuickCommandGroup[] {
    if (this.sortMode === 'manual') return list
    const arr = list.slice()
    if (this.sortMode === 'name') {
      arr.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }))
    } else {
      // 执行次数：组内命令次数之和，降序
      arr.sort((a, b) => this._groupUsage(b.name) - this._groupUsage(a.name))
    }
    return arr
  }

  private _groupUsage(groupName: string): number {
    return this.getGroupCommands(groupName).reduce((s, c) => s + (c.usageCount || 0), 0)
  }

  /** 切换「面板常驻」设置 */
  togglePinPanel(): void {
    this.pinPanel = !this.pinPanel
    try { localStorage.setItem('qc-plus-pin-panel', String(this.pinPanel)) } catch { /* ignore */ }
    // 必须写回 Tabby 配置：设置页的「面板常驻」是从 config 读的，
    // 只写 localStorage 会导致「在面板上取消常驻后，设置页仍显示开启」两边不同步。
    try {
      const cs = (this.svc as any)._configService
      const cfg = cs?.store?.['tabby-quick-command-plus']
      if (cfg) { cfg.pinPanel = this.pinPanel; cs.save() }
    } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('qc-plus-config-changed', { detail: { pinPanel: this.pinPanel } }))
  }

  /** 如果未开启「面板常驻」，则延迟关闭（避免焦点切换导致的卡顿） */
  private maybeClosePanel(): void {
    if (!this.pinPanel && this.onClose) {
      // 使用 requestAnimationFrame 确保终端焦点操作先完成，再关闭面板
      requestAnimationFrame(() => {
        // 额外加一层 setTimeout(0) 确保事件循环中焦点已经稳定
        setTimeout(() => this.doClose(), 0)
      })
    }
  }

  private onDataChanged = (): void => {
    this.loadData()
  }

  loadData(): void {
    this.svc.reload()
    this.commands = this.svc.getAll()
    this.groups = this.svc.getGroups()
    this.pinnedCommands = this.svc.getPinned()
    if (this.filterGroup && this.filterGroup !== '__auto__') {
      const valid = this.groups.some(g =>
        this.filterGroup === '__ungrouped__' ? !g.name : g.name === this.filterGroup
      )
      if (!valid) this.filterGroup = ''
    }
    this.onSearch()
  }

  /** 分组筛选下拉是否展开（自绘浮层，规避原生 <select> 在 Electron 下点不开的问题） */
  filterMenuOpen = false

  /** 当前分组筛选的显示文案 */
  get filterGroupLabel(): string {
    if (!this.filterGroup) return this.i18n.t('app.all_groups')
    if (this.filterGroup === '__auto__') return this.i18n.t('app.auto_filter')
    if (this.filterGroup === '__ungrouped__') return this.i18n.t('app.ungrouped')
    return this.filterGroup
  }

  toggleFilterMenu(event: MouseEvent): void {
    // 阻止冒泡到面板根的 noBubble（那里会顺手收起下拉，否则点了开了又立刻关）
    event.stopPropagation()
    this.filterMenuOpen = !this.filterMenuOpen
    if (this.filterMenuOpen) {
      // 面板本身 overflow:hidden ⇒ 菜单超出面板底部会被裁，按剩余空间收敛高度
      const scope = (event.currentTarget as HTMLElement | null)?.parentElement || null
      setTimeout(() => this._fitFilterMenu(scope), 0)
    }
  }

  /** 让下拉菜单高度贴合面板可用空间（面板可小到 200px 高）；scope 限定在本次点击的下拉容器内 */
  private _fitFilterMenu(scope: HTMLElement | null): void {
    try {
      const menu = scope?.querySelector('.qc-filter-menu') as HTMLElement | null
      if (!menu) return
      const panel = menu.closest('.qc-panel') as HTMLElement | null
      if (!panel) return
      const available = panel.getBoundingClientRect().bottom - menu.getBoundingClientRect().top - 8
      menu.style.maxHeight = `${Math.max(80, Math.min(180, available))}px`
    } catch { /* ignore */ }
  }

  chooseFilter(value: string): void {
    this.filterGroup = value
    this.filterMenuOpen = false
    this.onSearch()
  }

  onSearch(): void {
    let filtered = this.commands
    if (this.searchText) {
      const q = this.searchText.toLowerCase()
      filtered = filtered.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.shortName || '').toLowerCase().includes(q) ||
        (c.text || '').toLowerCase().includes(q)
      )
    }
    if (this.filterGroup === '__ungrouped__') {
      filtered = filtered.filter(c => !c.group)
    } else if (this.filterGroup === '__auto__') {
      // 自动模式：命令不过滤 group，由 displayGroups 根据 profileId 决定可见分组
    } else if (this.filterGroup) {
      filtered = filtered.filter(c => c.group === this.filterGroup)
    }
    this.filteredCommands = filtered
    // 按连接记住分组筛选 + 搜索词
    this.svc.saveConnectionFilter(this.profileId, { filterGroup: this.filterGroup, searchText: this.searchText })
  }

  getGroupCommands(groupName: string): QuickCommand[] {
    const list = this.filteredCommands.filter(c => (c.group || '') === (groupName || ''))
    if (this.sortMode === 'manual') return list
    const arr = list.slice()
    if (this.sortMode === 'name') {
      arr.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }))
    } else {
      arr.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
    }
    return arr
  }

  getPreview(cmd: QuickCommand): string {
    const text = cmd.text.replace(/\n/g, ' \u21B5 ')
    return text.length > 35 ? text.slice(0, 35) + '...' : text
  }

  toggleGroup(name: string): void {
    this.svc.toggleGroupExpanded(name)
    this.groups = this.svc.getGroups()
  }

  executeFirst(): void {
    if (this.filteredCommands.length > 0) {
      this.executeCommand(this.filteredCommands[0])
    }
  }

  onQuickBarWheel(event: WheelEvent): void {
    const el = event.currentTarget as HTMLElement
    if (!el) return
    event.preventDefault()
    el.scrollLeft += event.deltaY
  }

  executeCommand(cmd: QuickCommand): void {
    if (!this.terminalRef) return
    // 「执行时确认」守卫（收口：列表行 / 快捷条 / 搜索回车 / 参数弹窗都经此）
    if (!this._passConfirm(cmd, false)) return
    if (cmd.params && cmd.params.length > 0) {
      this.paramModalCmd = cmd
      this.paramModalParams = [...cmd.params]
      this.paramModalValues = {}
      this.paramModalForceExecute = false
      this.showParamModal = true
      return
    }
    this.sendCommand(cmd, cmd.text, false)
  }

  executeAlways(cmd: QuickCommand): void {
    if (!this.terminalRef) return
    // 行内 ⏎「发送并执行」同样受「执行时确认」约束
    if (!this._passConfirm(cmd, true)) return
    if (cmd.params && cmd.params.length > 0) {
      this.paramModalCmd = cmd
      this.paramModalParams = [...cmd.params]
      this.paramModalValues = {}
      this.paramModalForceExecute = true
      this.showParamModal = true
      return
    }
    this.sendCommand(cmd, cmd.text, true)
  }

  /* ---- 执行前确认（命令勾选「执行时确认」时生效） ---- */
  /** 待确认执行的命令；非空即显示确认弹窗 */
  pendingConfirmCmd: QuickCommand | null = null
  /** 确认后要走的执行方式：true = 发送并执行（⏎），false = 普通执行 */
  private pendingConfirmForceExecute = false
  /** 刚在确认框点过「执行」的命令 id（只放行一次，用后立即失效，避免影响下一次执行） */
  private _confirmApprovedId = ''
  private _confirmApprovedForce = false

  /**
   * 确认守卫：返回 true = 可继续执行；false = 已弹出确认框、等待用户处理。
   * 未勾选「执行时确认」的命令直接放行。
   */
  private _passConfirm(cmd: QuickCommand, forceExecute: boolean): boolean {
    if (!cmd.confirmBeforeRun) return true
    if (this._confirmApprovedId && this._confirmApprovedId === cmd.id && this._confirmApprovedForce === forceExecute) {
      this._confirmApprovedId = ''
      this._confirmApprovedForce = false
      return true
    }
    this.pendingConfirmCmd = cmd
    this.pendingConfirmForceExecute = forceExecute
    return false
  }

  /** 确认框里的命令预览：多步骤命令按启用顺序拼成多行 */
  get pendingConfirmPreview(): string {
    const cmd = this.pendingConfirmCmd
    if (!cmd) return ''
    if (cmd.steps && cmd.steps.length > 0) {
      return cmd.steps.filter(s => s.enabled !== false).map(s => s.text).filter(Boolean).join('\n')
    }
    return cmd.text || ''
  }

  confirmPendingRun(): void {
    const cmd = this.pendingConfirmCmd
    const force = this.pendingConfirmForceExecute
    this.pendingConfirmCmd = null
    if (!cmd) return
    this._confirmApprovedId = cmd.id
    this._confirmApprovedForce = force
    if (force) this.executeAlways(cmd)
    else this.executeCommand(cmd)
  }

  cancelPendingRun(): void {
    this.pendingConfirmCmd = null
    this.pendingConfirmForceExecute = false
  }

  confirmParamModal(): void {
    if (!this.paramModalCmd) return
    let text = this.paramModalCmd.text
    const paramValues: Record<string, string> = {}
    for (const p of this.paramModalParams) {
      const val = this.paramModalValues[p] ?? ''
      paramValues[p] = val
      // #8 修复：参数值可能包含 shell 特殊字符，记录警告
      if (/[;&|`$(){}!#\n]/.test(val)) {
        console.warn('[QC+] Parameter value for "' + p + '" contains shell-special characters, which may cause unexpected behavior when executed.')
      }
      text = text.split('${' + p + '}').join(val)
    }
    this.sendCommand(this.paramModalCmd, text, this.paramModalForceExecute, paramValues)
    this.closeParamModal()
  }

  closeParamModal(): void {
    this.showParamModal = false
    this.paramModalCmd = null
    this.paramModalParams = []
    this.paramModalValues = {}
  }

  sendToLine(cmd: QuickCommand): void {
    if (!this.terminalRef) return
    const steps = resolveSteps({ ...cmd, steps: cmd.steps, text: cmd.text })
    if (steps.length > 1) {
      this.multiStepCmd = cmd
      this.multiStepCount = steps.length
      this.showMultiStepHint = true
      return
    }
    this.sendLineText(steps[0]?.text || cmd.text)
  }

  confirmMultiStepJoin(): void {
    if (!this.multiStepCmd) return
    const steps = resolveSteps({ ...this.multiStepCmd, steps: this.multiStepCmd.steps, text: this.multiStepCmd.text })
    const joined = steps.map(s => s.text).filter(Boolean).join(' && ')
    if (joined) this.sendLineText(joined)
    this.cancelMultiStepHint()
  }

  cancelMultiStepHint(): void {
    this.showMultiStepHint = false
    this.multiStepCmd = null
    this.multiStepCount = 0
  }

  private sendLineText(text: string): void {
    if (!text) return
    try {
      let sent = false
      if (typeof this.terminalRef.sendInput === 'function') {
        this.terminalRef.sendInput(text); sent = true
      } else if (typeof this.terminalRef.write === 'function') {
        this.terminalRef.write(text); sent = true
      } else {
        const ssh = this.terminalRef?.sshSession ?? this.terminalRef?._session ?? null
        if (ssh && typeof ssh.write === 'function') { ssh.write(text); sent = true }
      }
      if (!sent) {
        const hostEl = this.terminalRef?.element?.nativeElement as HTMLElement | null
        if (hostEl) {
          const input = hostEl.querySelector('.xterm-helper-textarea, .xterm textarea, textarea, input') as HTMLTextAreaElement | HTMLInputElement | null
          if (input) {
            input.focus(); input.value = text
            input.dispatchEvent(new Event('input', { bubbles: true }))
            sent = true
          }
        }
      }
      if (sent) this.focusTerminal()
    } catch (e) { console.warn('[QC+] sendLineText error', e) }
  }

  private sendCommand(cmd: QuickCommand, text: string, forceExecute = false, paramValues?: Record<string, string>): void {
    this.svc.incrementUsage(cmd.id)
    // 如果有参数值，同时替换步骤文本中的占位符
    let effectiveCmd = cmd
    if (paramValues && cmd.steps && cmd.steps.length > 0) {
      effectiveCmd = {
        ...cmd,
        steps: cmd.steps.map(s => {
          let stepText = s.text
          for (const [p, val] of Object.entries(paramValues)) {
            stepText = stepText.split('${' + p + '}').join(val ?? '')
          }
          return { ...s, text: stepText }
        }),
      }
    }
    const steps = resolveSteps({ ...effectiveCmd, steps: effectiveCmd.steps, text })
    if (steps.length === 0) return
    this.executeSteps(cmd, steps, 0, forceExecute)
  }

  private sendRawBreak(onDone: () => void): void {
    try {
      const ctrlC = '\x03'
      let sent = false
      if (typeof this.terminalRef.sendInput === 'function') { this.terminalRef.sendInput(ctrlC); sent = true }
      else if (typeof this.terminalRef.write === 'function') { this.terminalRef.write(ctrlC); sent = true }
      else {
        const ssh = this.terminalRef?.sshSession ?? this.terminalRef?._session ?? null
        if (ssh && typeof ssh.write === 'function') { ssh.write(ctrlC); sent = true }
      }
      if (!sent) {
        const hostEl = this.terminalRef?.element?.nativeElement as HTMLElement | null
        if (hostEl) {
          const input = hostEl.querySelector('.xterm-helper-textarea, .xterm textarea, textarea, input') as HTMLTextAreaElement | HTMLInputElement | null
          if (input) {
            input.focus()
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', ctrlKey: true, bubbles: true }))
            input.dispatchEvent(new KeyboardEvent('keypress', { key: 'c', code: 'KeyC', ctrlKey: true, bubbles: true }))
            input.dispatchEvent(new KeyboardEvent('keyup', { key: 'c', code: 'KeyC', ctrlKey: true, bubbles: true }))
          }
        }
      }
    } catch { /* ignore */ }
    setTimeout(onDone, 100)
  }

  private executeSteps(cmd: QuickCommand, steps: CommandStep[], idx: number, forceExecute = false): void {
    console.log('[QC+] executeSteps START idx=' + idx + ' steps.length=' + steps.length + ' destroyed=' + this.destroyed)
    if (this.destroyed) { console.log('[QC+] executeSteps ABORT destroyed'); return }
    if (idx >= steps.length) {
      console.log('[QC+] executeSteps DONE idx=' + idx + ' >= steps.length=' + steps.length)
      this.focusTerminal()
      return
    }

    const step = steps[idx]
    const line = step.text
    const isLast = idx === steps.length - 1
    const appendLine = forceExecute ? true : (isLast ? (cmd.appendCR !== false) : true)
    console.log('[QC+] executeSteps idx=' + idx + ' type=' + step.type + ' text=' + JSON.stringify(line.substring(0, 60)) + ' isLast=' + isLast + ' appendLine=' + appendLine)

    // break 类型：发送 Ctrl+C 中断
    if (step.type === 'break') {
      console.log('[QC+] executeSteps BREAK idx=' + idx + ' delay=' + (step.delaySeconds || 0))
      setTimeout(() => {
        // #4 修复：setTimeout 回调中检查 destroyed 防止竞态
        if (this.destroyed) return
        console.log('[QC+] executeSteps BREAK fire idx=' + idx)
        this.sendRawBreak(() => {
          console.log('[QC+] executeSteps BREAK onDone idx=' + idx)
          if (this.destroyed) return
          const nextDelay = step.delaySeconds || 0
          if (nextDelay > 0) { setTimeout(() => { if (!this.destroyed) this.executeSteps(cmd, steps, idx + 1, forceExecute) }, nextDelay * 1000) }
          else { this.executeSteps(cmd, steps, idx + 1, forceExecute) }
        })
      }, 150)
      return
    }

    try {
      let sent = false
      const payload = appendLine ? line + '\n' : line
      console.log('[QC+] executeSteps SEND idx=' + idx + ' payload=' + JSON.stringify(payload.substring(0, 80)))
      if (typeof this.terminalRef.sendInput === 'function') {
        this.terminalRef.sendInput(payload)
        sent = true
      } else if (typeof this.terminalRef.write === 'function') {
        this.terminalRef.write(payload)
        sent = true
      } else {
        const ssh = this.terminalRef?.sshSession ?? this.terminalRef?._session ?? null
        if (ssh && typeof ssh.write === 'function') { ssh.write(payload); sent = true }
      }
      if (!sent) {
        const hostEl = this.terminalRef?.element?.nativeElement as HTMLElement | null
        if (hostEl) {
          const input = hostEl.querySelector('.xterm-helper-textarea, .xterm textarea, textarea, input') as HTMLTextAreaElement | HTMLInputElement | null
          if (input) {
            input.focus(); input.value = line
            input.dispatchEvent(new Event('input', { bubbles: true }))
            if (appendLine) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }))
            sent = true
          }
        }
      }
      console.log('[QC+] executeSteps SENT idx=' + idx + ' sent=' + sent)
      if (!sent && idx === 0) console.warn('[QC+] No terminal input method available')
      if (idx + 1 < steps.length) {
        const nextDelay = step.delaySeconds || 0
        console.log('[QC+] executeSteps NEXT idx=' + idx + ' nextDelay=' + nextDelay + ' nextIdx=' + (idx + 1))
        // #4 修复：setTimeout 回调中检查 destroyed
        if (nextDelay > 0) { setTimeout(() => { if (!this.destroyed) this.executeSteps(cmd, steps, idx + 1, forceExecute) }, nextDelay * 1000) }
        else { this.executeSteps(cmd, steps, idx + 1, forceExecute) }
      } else {
        console.log('[QC+] executeSteps ALL_DONE idx=' + idx + ' -> focusTerminal')
        this.executeSteps(cmd, steps, idx + 1, forceExecute)
      }
    } catch (e) { console.warn('[QC+] executeSteps error', e) }
  }

  private focusTerminal(): void {
    try {
      const hostEl = this.terminalRef?.element?.nativeElement as HTMLElement | null
      if (!hostEl) return
      const input = hostEl.querySelector('.xterm-helper-textarea, .xterm textarea, textarea, input') as HTMLElement | null
      if (input) input.focus()
    } catch { /* ignore */ }
    // 命令执行完毕，检查是否需要自动关闭面板
    this.maybeClosePanel()
  }

  showEditModal = false
  editCmd: any = { name: '', text: '' }

  showParamModal = false
  paramModalCmd: QuickCommand | null = null
  paramModalParams: string[] = []
  paramModalValues: Record<string, string> = {}
  private paramModalForceExecute = false

  showGroupRename = false
  groupRenameIsNew = false
  groupRenameOldName = ''
  groupRenameValue = ''
  groupRenameOrder = 0
  groupRenameProfileIds: string[] = []
  availableProfiles: { id: string; name: string; host?: string; port?: number }[] = []

  /** 加载配置连接列表（仅在打开分组编辑弹窗时调用一次） */
  private loadAvailableProfiles(): void {
    if (this.availableProfiles.length > 0) return // 已加载
    try {
      let rawProfiles: { id: string; name: string; host: string; port: number; type?: string }[] = []

      // 优先从 config.yaml 读取（数据准确，不含冗余条目）
      if (typeof require !== 'undefined') {
        const fs = require('fs')
        const path = require('path')
        const os = require('os')
        const home = os.homedir()
        const configDir = process.platform === 'win32'
          ? (process.env.APPDATA || path.join(home, 'AppData', 'Roaming'))
          : process.platform === 'darwin'
            ? path.join(home, 'Library', 'Application Support')
            : path.join(home, '.config')
        const yamlPath = path.join(configDir, 'tabby', 'config.yaml')
        if (fs.existsSync(yamlPath)) {
          const raw = fs.readFileSync(yamlPath, 'utf-8')
          rawProfiles = this.parseYamlProfiles(raw)
          console.log('[QuickCmd+] 数据来源: config.yaml, ' + rawProfiles.length + ' 条')
        }
      }

      // 回退：localStorage（YAML 不可用时）
      if (rawProfiles.length === 0) {
        let cfg: any = null
        let sourceKey = ''
        for (const key of ['tabby-config', 'config', 'tabby-config.json']) {
          const raw = localStorage.getItem(key)
          if (!raw) continue
          try { cfg = JSON.parse(raw); sourceKey = key; break } catch {}
        }
        if (cfg) {
          const arr = cfg?.profiles || cfg?.hotkeys?.profiles || []
          if (Array.isArray(arr) && arr.length > 0) {
            rawProfiles = this.mapProfileArray(arr)
            console.log('[QuickCmd+] 数据来源: localStorage.' + sourceKey + ', ' + rawProfiles.length + ' 条')
          }
        }
      }

      // 最终处理：只保留远程连接, 按 name 去重, 生成唯一 id
      if (rawProfiles.length > 0) {
        // 过滤：必须有 host 或 type 为 ssh/telnet 的真实连接
        const validProfiles = rawProfiles.filter(p => p.host || (!p.host && (p.type === 'ssh' || p.type === 'telnet')))

        const seen = new Map<string, { id: string; name: string; host: string; port: number }>()
        for (const p of validProfiles) {
          const key = p.name
          const existing = seen.get(key)
          if (!existing) {
            // 设置默认端口
            seen.set(key, { ...p, port: p.port || this.getDefaultPort(p.type) })
          } else if (!existing.host && p.host) {
            seen.set(key, { ...p, port: p.port || this.getDefaultPort(p.type) })
          }
        }
        this.availableProfiles = Array.from(seen.values()).map((p, i) => ({
          ...p,
          id: p.id || `${p.name}|${p.host}|${p.port}|${i}`,
        }))
        console.log('[QuickCmd+] 最终 ' + this.availableProfiles.length + ' 条:', JSON.stringify(this.availableProfiles))
      }
    } catch (e) { console.error('[QuickCmd+] 加载 profiles 失败:', e) }
  }

  /** 解析 config.yaml 中的 profiles 数组 */
  private parseYamlProfiles(raw: string): { id: string; name: string; host: string; port: number; type: string }[] {
    const result: { id: string; name: string; host: string; port: number; type: string }[] = []
    const lines = raw.split('\n')
    let current: { id: string; name: string; host: string; port: number; type: string } | null = null
    let inProfiles = false
    let inOptions = false
    let profileIndent = -1

    for (const line of lines) {
      if (!inProfiles) {
        if (/^\s*profiles\s*:/.test(line)) { inProfiles = true }
        continue
      }
      // 非缩进的顶级 key → 退出 profiles
      if (!/^\s/.test(line) && line.trim() && !line.trim().startsWith('#')) {
        if (current?.name) result.push(current)
        break
      }

      // 缩进级别
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0

      // 新 profile 项：同缩进的 '- '
      if (line.trim().startsWith('- ') && (profileIndent === -1 || indent === profileIndent)) {
        if (current?.name) result.push(current)
        if (profileIndent === -1) profileIndent = indent
        current = { id: '', name: '', host: '', port: 0, type: '' }
        inOptions = false
        const afterDash = line.replace(/^\s*-\s*/, '')
        if (afterDash.startsWith('type:')) {
          current.type = afterDash.replace(/^type:\s*['"]?/, '').replace(/['"]\s*$/, '').trim()
        } else if (afterDash.startsWith('name:')) {
          current.name = afterDash.replace(/^name:\s*['"]?/, '').replace(/['"]\s*$/, '').trim()
        } else if (afterDash.startsWith('id:')) {
          current.id = afterDash.replace(/^id:\s*['"]?/, '').replace(/['"]\s*$/, '').trim()
        }
        continue
      }
      if (!current) continue

      const trim = line.trim()
      const valuePart = trim.replace(/\s*#.*$/, '')

      if (valuePart.startsWith('id:')) {
        current.id = valuePart.replace(/^id:\s*['"]?/, '').replace(/['"]\s*$/, '').trim()
      } else if (valuePart.startsWith('name:')) {
        current.name = valuePart.replace(/^name:\s*['"]?/, '').replace(/['"]\s*$/, '').trim()
      } else if (valuePart.startsWith('type:') && !inOptions) {
        current.type = valuePart.replace(/^type:\s*['"]?/, '').replace(/['"]\s*$/, '').trim()
      } else if (valuePart.startsWith('options:')) {
        inOptions = true
      } else if (inOptions && valuePart.startsWith('host:')) {
        current.host = valuePart.replace(/^host:\s*['"]?/, '').replace(/['"]\s*$/, '').trim()
      } else if (inOptions && valuePart.startsWith('port:')) {
        current.port = parseInt(valuePart.replace(/^port:\s*['"]?/, '').replace(/['"]\s*$/, '').trim()) || 0
      }
    }
    if (current?.name) result.push(current)

    // 按 name 去重（同名保留有 host 的）
    const seen = new Map<string, { id: string; name: string; host: string; port: number; type: string }>()
    for (const p of result) {
      const key = p.name
      const existing = seen.get(key)
      if (!existing) {
        seen.set(key, p)
      } else if (!existing.host && p.host) {
        seen.set(key, p)
      }
    }
    return Array.from(seen.values())
  }

  /** 根据连接类型返回默认端口 */
  private getDefaultPort(type: string): number {
    switch (type) {
      case 'ssh': return 22
      case 'telnet': return 23
      case 'serial': return 0
      case 'local': return 0
      default: return 0
    }
  }

  private mapProfileArray(arr: any[]): { id: string; name: string; host: string; port: number }[] {
    return arr
      .filter((p: any) => {
        // 过滤：必须有 name，且有 host 或有效的连接类型
        if (!p || !p.name) return false
        const host = p.options?.host || p.host || ''
        const type = p.options?.type || p.type || ''
        // 没有连接信息的 profile（如虚拟分组、内部 profile）不显示
        if (!host && !type) return false
        return true
      })
      .map((p: any, i: number) => ({
        id: String(p.id) || `${p.name}|${p.options?.host || p.host || ''}|${p.options?.port ?? p.port ?? 0}|${i}`,
        name: p.name,
        host: p.options?.host || p.host || '',
        port: p.options?.port ?? p.port ?? this.getDefaultPort(p.options?.type || p.type || ''),
      }))
  }

  showMultiStepHint = false
  multiStepCount = 0
  private multiStepCmd: QuickCommand | null = null

  addCommand(): void {
    this.editCmd = { name: '', shortName: '', text: '', group: '', appendCR: true, pinned: false, confirmBeforeRun: false, steps: [{ text: '', delaySeconds: 0, type: 'command', enabled: true }] }
    this.showEditModal = true
  }

  addCommandToGroup(groupName: string): void {
    this.editCmd = { name: '', shortName: '', text: '', group: groupName || '', appendCR: true, pinned: false, confirmBeforeRun: false, steps: [{ text: '', delaySeconds: 0, type: 'command', enabled: true }] }
    this.showEditModal = true
  }

  editCommand(cmd: QuickCommand): void {
    this.editCmd = JSON.parse(JSON.stringify(cmd))
    if (!this.editCmd.steps || this.editCmd.steps.length === 0) {
      if (this.editCmd.text) {
        const lines = this.editCmd.text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0)
        const globalDelay = this.editCmd.delaySeconds || 0
        this.editCmd.steps = lines.map((line: string, i: number) => ({ text: line, delaySeconds: i < lines.length - 1 ? globalDelay : 0, enabled: true }))
      } else { this.editCmd.steps = [{ text: '', delaySeconds: 0, type: 'command', enabled: true }] }
    } else {
      this.editCmd.steps.forEach((s: any) => { if (s.enabled === undefined) s.enabled = true })
    }
    this.showEditModal = true
    // 等待 DOM 渲染后自动调整 textarea 高度
    setTimeout(() => {
      document.querySelectorAll('.qc-step-input').forEach(el => this.autoGrowElement(el as HTMLTextAreaElement))
    }, 50)
  }

  togglePin(cmd: QuickCommand): void {
    const next = !cmd.pinned
    this.svc.update(cmd.id, { pinned: next })
    cmd.pinned = next
    // 同步书签顺序：新钉住的排到末尾（符合直觉），取消钉住的移出顺序
    const ids = this.svc.getPinned().map(c => c.id).filter(id => id !== cmd.id)
    if (next) ids.push(cmd.id)
    this.svc.applyPinnedOrder(ids)
    this.loadData()
  }

  onResetUsage(): void {
    if (!this.editCmd?.id) return
    this.svc.update(this.editCmd.id, { usageCount: 0 })
    this.editCmd.usageCount = 0
  }

  get editCmdSteps(): CommandStep[] { return this.editCmd?.steps || [] }
  set editCmdSteps(v: CommandStep[]) { this.editCmd.steps = v }

  addStep(): void { this.editCmd.steps.push({ text: '', delaySeconds: 0, type: 'command', enabled: true }) }

  addBreakStep(): void { this.editCmd.steps.push({ text: '', delaySeconds: 1, type: 'break', enabled: true }) }

  autoGrow(event: Event): void { this.autoGrowElement(event.target as HTMLTextAreaElement) }

  private autoGrowElement(ta: HTMLTextAreaElement): void {
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
  }

  removeStep(index: number): void {
    this.editCmd.steps.splice(index, 1)
    if (this.editCmd.steps.length === 0) this.editCmd.steps.push({ text: '', delaySeconds: 0 })
  }

  /* ---- 步骤拖拽排序 ---- */
  stepDragIdx: number | null = null

  onStepDragStart(event: DragEvent, idx: number): void {
    this.stepDragIdx = idx
    event.dataTransfer!.effectAllowed = 'move'
    // 使用 1x1 透明图像作为拖拽图像，防止横向滚动条
    const img = new Image()
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    event.dataTransfer!.setDragImage(img, 0, 0)
  }

  onStepDragOver(event: DragEvent, idx: number): void {
    event.preventDefault()
    event.dataTransfer!.dropEffect = 'move'
    const el = event.currentTarget as HTMLElement
    const rows = el.parentElement?.querySelectorAll('.qc-step-row')
    rows?.forEach(r => r.classList.remove('drag-over', 'drag-over-bottom'))
    const rect = el.getBoundingClientRect()
    const y = event.clientY - rect.top
    if (y > rect.height / 2) {
      el.classList.add('drag-over-bottom')
    } else {
      el.classList.add('drag-over')
    }
  }

  onStepDragLeave(event: DragEvent): void {
    ;(event.currentTarget as HTMLElement).classList.remove('drag-over', 'drag-over-bottom')
  }

  onStepDragEnd(): void {
    this.stepDragIdx = null
    document.querySelectorAll('.qc-step-row.drag-over, .qc-step-row.drag-over-bottom').forEach(el => el.classList.remove('drag-over', 'drag-over-bottom'))
  }

  onStepDrop(event: DragEvent, idx: number): void {
    event.preventDefault()
    if (this.stepDragIdx === null) { this.onStepDragEnd(); return }
    const steps = this.editCmd.steps
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const y = event.clientY - rect.top
    const dropAfter = y > rect.height / 2
    let targetIdx = idx
    if (dropAfter) targetIdx = idx + 1
    if (this.stepDragIdx === targetIdx || this.stepDragIdx === targetIdx - 1) { this.onStepDragEnd(); return }
    const [moved] = steps.splice(this.stepDragIdx, 1)
    const insertAt = this.stepDragIdx < targetIdx ? targetIdx - 1 : targetIdx
    steps.splice(insertAt, 0, moved)
    this.onStepDragEnd()
  }

  saveEditCmd(): void {
    if (!this.editCmd.name || !this.editCmd.name.trim()) return
    const steps = this.editCmd.steps || []
    const text = steps.map((s: CommandStep) => s.text).join('\n')
    if (!text.trim()) return
    const updateData = {
      name: this.editCmd.name.trim(),
      // 简称：仅用于固定快捷入口显示，留空则快捷条回退显示命令名称
      shortName: (this.editCmd.shortName || '').trim(),
      text: text.trim(), group: this.editCmd.group || '',
      appendCR: this.editCmd.appendCR !== false, pinned: !!this.editCmd.pinned,
      confirmBeforeRun: !!this.editCmd.confirmBeforeRun,
      sendCtrlC: false, sendCtrlCAfter: false, // 步骤模式下清除旧版兼容字段，避免 resolveSteps 追加重复 break
      steps: steps.map((s: CommandStep) => ({ text: s.text, delaySeconds: Math.max(0, +(s.delaySeconds || 0)), type: s.type || 'command', enabled: s.enabled !== false })),
    }
    if (this.editCmd.id) { this.svc.update(this.editCmd.id, updateData) }
    else { this.svc.add({ ...updateData, params: [], sshProfiles: [] }) }
    this.showEditModal = false; this.searchText = ''; this.loadData()
  }

  closeEditModal(): void { this.showEditModal = false }

  getParamBadge(cmd: QuickCommand): string {
    const count = cmd.params?.length || 0
    return count > 1 ? `${count} vars` : '${...}'
  }

  private dragCmdId: string | null = null
  listDropOver = false

  onDragStart(event: DragEvent, cmd: QuickCommand): void {
    this.dragCmdId = cmd.id
    // 兜底：先清掉上一轮可能残留的插入指示与拖拽样式
    this.listDropOver = false
    this.cleanDragStyles()
    // 兜底：drop 后列表会按新顺序重排 *ngFor，拖拽源元素可能已被销毁，导致绑在它上面的 dragend
    // 不触发 → 插入指示永久残留（组末尾出现一条主色条）。在 document 上挂一次性 dragend，
    // 无论拖拽如何结束都保证清理（once:true 自动解绑，不会泄漏）。
    document.addEventListener('dragend', this._onAnyDragEnd, { once: true })
    event.dataTransfer?.setData('text/plain', cmd.id)
    event.dataTransfer!.effectAllowed = 'move'
    // 给列表添加 is-dragging 类，拖拽期间禁用所有 hover 展开
    if (this.listRef?.nativeElement) {
      this.listRef.nativeElement.classList.add('is-dragging')
    }
    // 使用预加载的 1x1 透明图像作为拖拽图像，避免默认快照过宽
    const img = new Image()
    img.onload = () => {
      event.dataTransfer?.setDragImage(img, 0, 0)
    }
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    // 立即设置一次（onload 可能异步延迟，部分浏览器支持直接设置未加载图像）
    event.dataTransfer?.setDragImage(img, 0, 0)
  }

  private dragOverEl: HTMLElement | null = null

  onDragOver(event: DragEvent): void {
    event.preventDefault()
    event.dataTransfer!.dropEffect = 'move'
    const el = event.currentTarget as HTMLElement
    // 只清理当前命令列表内的行（同分组），避免全局 querySelectorAll
    const rows = el.parentElement?.querySelectorAll('.qc-cmd-row')
    rows?.forEach(r => r.classList.remove('drag-over', 'drag-over-bottom'))
    const rect = el.getBoundingClientRect()
    const y = event.clientY - rect.top
    if (y > rect.height / 2) {
      el.classList.add('drag-over-bottom')
    } else {
      el.classList.add('drag-over')
    }
  }

  onDragLeave(event: DragEvent): void {
    (event.currentTarget as HTMLElement).classList.remove('drag-over', 'drag-over-bottom')
  }

  onDrop(event: DragEvent, targetCmd: QuickCommand): void {
    event.preventDefault(); event.stopPropagation(); this.cleanDragStyles()
    // 清掉组末尾的插入指示：拖拽经过组容器时 onListDragOver 会把它置 true，而本路径是行级 drop、
    // 不经过 onListDrop，若此处不清就会残留一条 4px 主色条（表现为「拖拽后底部多了一条 border」）
    this.listDropOver = false
    console.log('[QC+] onDrop srcId=' + (this.dragCmdId || '-') + ' target=' + targetCmd.name + ' targetId=' + targetCmd.id)
    const srcId = this.dragCmdId || event.dataTransfer?.getData('text/plain')
    if (!srcId || srcId === targetCmd.id) return
    const allCmds = this.commands
    const srcIdx = allCmds.findIndex(c => c.id === srcId)
    const tgtIdx = allCmds.findIndex(c => c.id === targetCmd.id)
    if (srcIdx === -1 || tgtIdx === -1) return
    const srcCmd = allCmds[srcIdx]
    if ((srcCmd.group || '') !== (targetCmd.group || '')) {
      this.svc.update(srcCmd.id, { group: targetCmd.group || '' })
      srcCmd.group = targetCmd.group || ''
    }
    // 检测鼠标位置决定插入到目标上方还是下方
    const el = event.currentTarget as HTMLElement
    const y = event.clientY - el.getBoundingClientRect().top
    const dropAfter = y > el.offsetHeight / 2
    const [moved] = allCmds.splice(srcIdx, 1)
    const adjustedTgt = tgtIdx > srcIdx ? tgtIdx - 1 : tgtIdx
    const insertAt = dropAfter ? adjustedTgt + 1 : adjustedTgt
    allCmds.splice(insertAt, 0, moved)
    this.svc.reorder(allCmds.map(c => c.id))
    // 直接从 service 同步，不调用 loadData（避免 reload 从 config 覆盖 reorder 结果）
    this.commands = this.svc.getAll()
    this.onSearch()
  }

  onDropToGroup(event: DragEvent, groupName: string): void {
    event.preventDefault(); this.cleanDragStyles()
    this.listDropOver = false
    const srcId = this.dragCmdId || event.dataTransfer?.getData('text/plain')
    if (!srcId) return
    const srcCmd = this.commands.find(c => c.id === srcId)
    if (!srcCmd || (srcCmd.group || '') === (groupName || '')) return
    this.svc.update(srcCmd.id, { group: groupName || '' })
    const allIds = this.commands.map(c => c.id)
    const idx = allIds.indexOf(srcId)
    if (idx !== -1) allIds.splice(idx, 1)
    allIds.push(srcId)
    this.svc.reorder(allIds)
    // 直接同步，不走 loadData 避免 reorder 被 config 覆盖
    this.commands = this.svc.getAll()
    this.groups = this.svc.getGroups()
    this.onSearch()
  }

  onDragEnd(event: DragEvent): void {
    this.dragCmdId = null
    this.cleanDragStyles()
    this.listDropOver = false
    if (this.listRef?.nativeElement) {
      this.listRef.nativeElement.classList.remove('is-dragging')
    }
  }

  /** document 级 dragend 兜底（由 onDragStart 以 once 方式挂载）：任何拖拽结束路径都清理插入指示 */
  private _onAnyDragEnd = (): void => {
    this.listDropOver = false
    // cleanDragStyles 内部是直接操作 DOM 类（不依赖变更检测），因此在 zone 外执行同样有效
    this.cleanDragStyles()
  }

  onListDragOver(event: DragEvent): void {
    event.preventDefault()
    event.dataTransfer!.dropEffect = 'move'
    this.listDropOver = true
  }

  onListDragLeave(event: DragEvent): void {
    this.listDropOver = false
  }

  /** 右键命令条目：直接进入编辑弹窗（省去双击 / 找编辑按钮） */
  onCmdContextMenu(event: MouseEvent, cmd: QuickCommand): void {
    event.preventDefault(); event.stopPropagation()
    this.editCommand(cmd)
  }

  /** 快捷入口芯片上的 ✕：取消固定（复用 togglePin 的顺序同步逻辑，移除后不再出现在快捷条） */
  unpinQuick(cmd: QuickCommand): void {
    if (cmd.pinned) this.togglePin(cmd)
  }

  /* ---- 列表滚动吸附：停止后把顶端对齐到「整行」边界，避免条目被裁成半行 ---- */
  private _snapTimer: any = null

  onListScroll(): void {
    // 吸附是可选功能（设置页「滚动吸附到整行」，默认关闭）：关闭时完全不干预滚动
    if (!this.scrollSnapEnabled) return
    // 用 debounce 等惯性滚动停下来再吸附（等价于 DOM scroll-snap 的体验，但可控性更好）
    if (this._snapTimer) clearTimeout(this._snapTimer)
    this._snapTimer = setTimeout(() => this._snapListScroll(), 120)
  }

  /**
   * 把列表的 scrollTop 对齐到最近的行 / 分组头边界：
   * 顶部永远是完整一行（切到下一行时旧行整体滚出），底部因此最多空出一段留白，
   * 而不是露出半行 UI。滚到最底部时改为底部对齐（保证最后一行完整可见）。
   */
  private _snapListScroll(): void {
    const list = this.listRef?.nativeElement as HTMLElement | null
    if (!list) return
    const items = Array.from(
      list.querySelectorAll<HTMLElement>('.qc-group-header, .qc-cmd-row')
    )
    if (items.length === 0) return
    const scrollTop = list.scrollTop
    const listTop = list.getBoundingClientRect().top
    const bounds = new Set<number>()
    for (const el of items) {
      // 元素相对「列表内容顶部」的偏移（children 可能滚动出视口，故用 rect 反推）
      const off = Math.round(el.getBoundingClientRect().top - listTop + scrollTop)
      if (off > 0) bounds.add(off)
    }
    const sorted = Array.from(bounds).sort((a, b) => a - b)
    const maxScroll = list.scrollHeight - list.clientHeight
    if (maxScroll <= 0) return
    // 取 ≤ scrollTop 的最大边界（顶部对齐）；滚动到底附近则退化为底部对齐
    let target = 0
    for (const b of sorted) { if (b <= scrollTop + 1) target = b; else break }
    if (target > 0 && Math.abs(scrollTop - maxScroll) <= 2) target = maxScroll
    if (Math.abs(target - scrollTop) > 1) list.scrollTop = target
  }

  /* ---- 快捷入口（书签）拖拽排序：只改书签自身顺序，不影响命令列表 ---- */
  quickDragId: string | null = null
  quickDropId: string | null = null
  quickDropSide: 'left' | 'right' = 'right'

  onQuickDragStart(event: DragEvent, cmd: QuickCommand): void {
    this.quickDragId = cmd.id
    event.dataTransfer?.setData('text/plain', 'quick:' + cmd.id)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
    // 与列表拖拽同样的兜底：drop 后重排可能让源元素被销毁，绑在它上面的 dragend 会丢
    document.addEventListener('dragend', this._onAnyQuickDragEnd, { once: true })
  }

  onQuickDragOver(event: DragEvent): void {
    // 只接管「由快捷条自身发起」的拖拽：列表条目拖到快捷条上方时不接管（不 preventDefault，
    // 因而不会成为 drop 目标），避免把列表拖拽误判成书签排序
    if (this.quickDragId === null) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    const el = event.currentTarget as HTMLElement
    this.quickDropId = el.getAttribute('data-qc-quick-id')
    const rect = el.getBoundingClientRect()
    this.quickDropSide = (event.clientX - rect.left) > rect.width / 2 ? 'right' : 'left'
  }

  onQuickDragLeave(event: DragEvent): void {
    const el = event.currentTarget as HTMLElement
    if (this.quickDropId === el.getAttribute('data-qc-quick-id')) {
      this.quickDropId = null
      this.quickDropSide = 'right'
    }
  }

  onQuickDrop(event: DragEvent, target: QuickCommand): void {
    if (this.quickDragId === null) return
    event.preventDefault(); event.stopPropagation()
    const raw = event.dataTransfer?.getData('text/plain') || ''
    const srcId = this.quickDragId || raw.replace(/^quick:/, '')
    const el = event.currentTarget as HTMLElement
    const dropAfter = (event.clientX - el.getBoundingClientRect().left) > el.offsetWidth / 2
    this._clearQuickDragState()
    if (!srcId || srcId === target.id) return
    const ids = this.svc.getPinned().map(c => c.id)
    const from = ids.indexOf(srcId)
    const to = ids.indexOf(target.id)
    if (from === -1 || to === -1) return
    ids.splice(from, 1)
    // 目标位于源之后时，移除源元素会让目标索引前移 1，故按方向补偿
    const insertAt = from < to ? (dropAfter ? to : to - 1) : (dropAfter ? to + 1 : to)
    ids.splice(Math.max(0, Math.min(insertAt, ids.length)), 0, srcId)
    this.svc.reorderPinned(ids)
    this.pinnedCommands = this.svc.getPinned()
  }

  onQuickDragEnd(): void { this._clearQuickDragState() }

  /** document 级 dragend 兜底（由 onQuickDragStart 以 once 挂载） */
  private _onAnyQuickDragEnd = (): void => { this._clearQuickDragState() }

  private _clearQuickDragState(): void {
    this.quickDragId = null
    this.quickDropId = null
    this.quickDropSide = 'right'
  }

  onListDrop(event: DragEvent, groupName: string): void {
    event.preventDefault()
    console.log('[QC+] onListDrop group=' + groupName + ' srcId=' + (this.dragCmdId || '-'))
    this.listDropOver = false
    this.cleanDragStyles()
    const srcId = this.dragCmdId || event.dataTransfer?.getData('text/plain')
    if (!srcId) return
    const srcCmd = this.commands.find(c => c.id === srcId)
    if (!srcCmd) return
    if ((srcCmd.group || '') !== (groupName || '')) {
      this.svc.update(srcCmd.id, { group: groupName || '' })
      srcCmd.group = groupName || ''
    }
    const allIds = this.commands.map(c => c.id)
    const idx = allIds.indexOf(srcId)
    if (idx !== -1) allIds.splice(idx, 1)
    allIds.push(srcId)
    this.svc.reorder(allIds)
    this.commands = this.svc.getAll()
    this.groups = this.svc.getGroups()
    this.onSearch()
  }

  /**
   * 清除拖拽期间残留的指示类（行插入线 / 半透明源行 / 组头线 / 步骤行线 / 末尾插入条）。
   * ⚠ 查询范围必须是**面板自身容器**：QC+ 面板挂在 document.body 下的 panelHost 里，
   *   并不在 terminalRef 元素子树内 —— 早先用 terminalRef 当 scope 时 querySelectorAll 恒为空，
   *   行上的 drag-over 永远清不掉，松手后行顶部就残留一条 3px 主色线（用户反馈的“border”）。
   */
  private _clearDragClasses(): void {
    try {
      const own = (this.listRef?.nativeElement as HTMLElement | null)?.closest('.qc-panel') as HTMLElement | null
      const root: ParentNode = own || document
      root.querySelectorAll(
        '.qc-cmd-row.dragging, .qc-cmd-row.drag-over, .qc-cmd-row.drag-over-bottom,' +
        ' .qc-group-header.drag-over, .qc-group-header.drag-over-bottom,' +
        ' .qc-step-row.drag-over, .qc-step-row.drag-over-bottom,' +
        ' .qc-drop-end.drag-over'
      ).forEach(el => el.classList.remove('dragging', 'drag-over', 'drag-over-bottom'))
    } catch { /* ignore */ }
  }

  private cleanDragStyles(): void {
    this._clearDragClasses()
    // 兜底：确保列表的 is-dragging 类被移除
    if (this.listRef?.nativeElement) {
      this.listRef.nativeElement.classList.remove('is-dragging')
    }
  }

  showGroupRenameDialog(oldName: string): void {
    this.loadAvailableProfiles()
    this.groupRenameIsNew = false; this.groupRenameOldName = oldName; this.groupRenameValue = oldName
    const g = this.svc.getGroups().find(gr => gr.name === oldName)
    this.groupRenameOrder = g?.order ?? 0
    this.groupRenameProfileIds = g?.profileIds ? [...g.profileIds] : []
    this.showGroupRename = true
  }

  toggleGroupProfile(profileId: string, checked: boolean): void {
    if (checked) {
      if (!this.groupRenameProfileIds.includes(profileId)) this.groupRenameProfileIds.push(profileId)
    } else {
      this.groupRenameProfileIds = this.groupRenameProfileIds.filter(id => id !== profileId)
    }
  }

  toggleAllProfiles(selectAll: boolean): void {
    if (selectAll) {
      this.groupRenameProfileIds = this.availableProfiles.map(p => p.id)
    } else {
      this.groupRenameProfileIds = []
    }
  }

  deleteGroup(name: string): void {
    if (!name) return
    // #14 修复：使用自定义确认弹窗替代原生 confirm()
    this.confirmModalTitle = this.i18n.t('group.delete_confirm', { name })
    this._confirmCallback = () => {
      this.svc.removeGroup(name)
      this.loadData()
    }
    this.showConfirmModal = true
  }

  deleteCommand(cmd: QuickCommand): void {
    // #14 修复：使用自定义确认弹窗替代原生 confirm()
    this.confirmModalTitle = this.i18n.t('panel.delete_confirm', { name: cmd.name })
    this._confirmCallback = () => {
      this.svc.remove(cmd.id)
      this.loadData()
    }
    this.showConfirmModal = true
  }

  /* ---- #14 自定义确认弹窗 ---- */
  showConfirmModal = false
  confirmModalTitle = ''
  private _confirmCallback: (() => void) | null = null

  doConfirmModal(): void {
    this.showConfirmModal = false
    if (this._confirmCallback) {
      this._confirmCallback()
      this._confirmCallback = null
    }
  }

  cancelConfirmModal(): void {
    this.showConfirmModal = false
    this._confirmCallback = null
  }

  confirmGroupRename(): void {
    const newName = this.groupRenameValue?.trim()
    if (this.groupRenameIsNew) {
      if (newName) {
        this.svc.addGroup(newName, this.groupRenameOrder)
        this.svc.updateGroupProfiles(newName, this.groupRenameProfileIds)
      }
    } else {
      if (!newName || newName === this.groupRenameOldName) {
        // 名称没变，更新排序和 profileIds
        this.svc.updateGroupOrder(this.groupRenameOldName, this.groupRenameOrder)
        this.svc.updateGroupProfiles(this.groupRenameOldName, this.groupRenameProfileIds)
        this.closeGroupRename(); this.loadData(); return
      }
      this.svc.renameGroup(this.groupRenameOldName, newName)
      this.svc.updateGroupOrder(newName, this.groupRenameOrder)
      this.svc.updateGroupProfiles(newName, this.groupRenameProfileIds)
    }
    this.closeGroupRename(); this.loadData()
  }

  closeGroupRename(): void { this.showGroupRename = false; this.groupRenameIsNew = false; this.groupRenameOldName = ''; this.groupRenameValue = ''; this.groupRenameOrder = 0; this.groupRenameProfileIds = []; this.availableProfiles = [] }

  addNewGroup(): void { this.loadAvailableProfiles(); this.groupRenameIsNew = true; this.groupRenameOldName = ''; this.groupRenameValue = ''; this.groupRenameOrder = 0; this.groupRenameProfileIds = []; this.showGroupRename = true }

  startDrag(event: MouseEvent): void {
    if (event.button !== 0) return
    this.dragging = true
    this.dragOffsetX = event.clientX - this.panelX
    this.dragOffsetY = event.clientY - this.panelY
    const hostEl = (this.terminalHostEl || this.terminalRef?.element?.nativeElement) as HTMLElement | null
    this.dragMoveHandler = (ev: MouseEvent) => {
      if (!this.dragging) return
      let x = ev.clientX - this.dragOffsetX
      let y = ev.clientY - this.dragOffsetY
      if (hostEl) {
        // 面板是 body + position:fixed（panelX/panelY 为视口坐标），因此必须以「所属 pane 的
        // 视口矩形」为界。旧实现用 hostEl.clientWidth/clientHeight（pane 内尺寸）并把坐标 clamp 到
        // [0, …]：拆分时 pane 带 left/top 偏移，等于允许把面板拖到视口左上角（隔壁 pane 区域），
        // 表现为「一拖拽就跳出拆分窗口」。改为 r.left/r.top + pad 起算，与 resize / 打开裁剪同一口径。
        const r = hostEl.getBoundingClientRect()
        const panelEl = hostEl.querySelector('.qc-panel') as HTMLElement | null
        const pw = panelEl?.offsetWidth || this.panelWidth || 320
        const ph = panelEl?.offsetHeight || this.panelHeight || 200
        const pad = 4
        const maxX = Math.max(r.left + pad, r.right - pw - pad)
        const maxY = Math.max(r.top + pad, r.bottom - ph - pad)
        x = Math.max(r.left + pad, Math.min(x, maxX))
        y = Math.max(r.top + pad, Math.min(y, maxY))
      }
      this.panelX = x; this.panelY = y
    }
    this.dragUpHandler = () => {
      this.dragging = false
      // 位置全局统一：保存并同步到所有已打开的面板
      this._saveCurrentPosToGlobal()
      this.cleanDrag()
    }
    document.addEventListener('mousemove', this.dragMoveHandler)
    document.addEventListener('mouseup', this.dragUpHandler)
  }

  private cleanDrag(): void {
    if (this.dragMoveHandler) { document.removeEventListener('mousemove', this.dragMoveHandler); this.dragMoveHandler = null }
    if (this.dragUpHandler) { document.removeEventListener('mouseup', this.dragUpHandler); this.dragUpHandler = null }
  }

  /* ---- 面板大小调整 ---- */
  startResize(event: MouseEvent, dir: string): void {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const panelEl = (event.currentTarget as HTMLElement).closest('.qc-panel') as HTMLElement
    const startH = this.panelHeight || panelEl?.offsetHeight || 420
    this.resizing = { dir, startW: this.panelWidth, startH, lastX: event.clientX, lastY: event.clientY }
    this.resizeMoveHandler = (ev: MouseEvent) => {
      if (!this.resizing) return
      const dx = ev.clientX - this.resizing.lastX
      const dy = ev.clientY - this.resizing.lastY
      this.resizing.lastX = ev.clientX
      this.resizing.lastY = ev.clientY
      const dir = this.resizing.dir
      // 容器边界约束：以「所属 pane 的可视矩形」为基准。面板是 body+fixed，panelX/panelY 是
      // 视口坐标，旧实现拿 clientWidth 与视口坐标混算，拆分窗口下边界会算错。
      const hostEl = this.terminalHostEl || (this.terminalRef?.element?.nativeElement as HTMLElement | null)
      const paneR = hostEl?.getBoundingClientRect()
      const paneW = paneR?.width ?? 9999
      const paneH = paneR?.height ?? 9999
      const pad = 4
      const relX = paneR ? this.panelX - paneR.left : 0
      const relY = paneR ? this.panelY - paneR.top : 0
      // 尺寸下限随 pane 收缩；高度下限放宽到 200（搜索栏 + 两行命令 + footer 仍可用），
      // 便于「矮而宽」的贴角摆放
      const minW = Math.max(160, Math.min(280, paneW - pad * 2))
      const minH = Math.max(140, Math.min(200, paneH - pad * 2))
      let newW = this.panelWidth
      let newH = this.panelHeight || this.resizing.startH
      // E/SE/NE：右边缘不超出 pane
      if (dir.includes('e')) { const limit = paneW - relX - pad; newW = Math.max(minW, Math.min(newW + dx, limit)) }
      // W/NW/SW：左边缘不超出 pane 左边界
      // ⚠ leftLimit 只应限制「向左扩展」（dw 为负）那一侧，不能限制「向右收缩」——
      //    早先写成 Math.min(dx, maxShrink, leftLimit)，面板贴 pane 左沿（relX=0）时 dy/dx 被压成 0，
      //    导致宽度/高度完全锁死（表现为拖左上/右上角只能调宽度、调不了高度）。
      if (dir.includes('w')) {
        const maxShrink = newW - minW   // 向右最多收缩量（dw 正向上限）
        const leftLimit = relX          // 向左最多扩展量（dw 负向下限）
        const dw = Math.max(Math.min(dx, maxShrink), -leftLimit)
        newW -= dw; this.panelX += dw
      }
      // S/SW/SE：下边缘不超出 pane
      if (dir.includes('s')) { const limit = paneH - relY - pad; newH = Math.max(minH, Math.min(newH + dy, limit)) }
      // N/NE/NW：上边缘不超出 pane 上边界（topLimit 同上，只限制向上扩展）
      if (dir.includes('n')) {
        const maxShrink = newH - minH   // 向下最多收缩量（dh 正向上限）
        const topLimit = relY           // 向上最多扩展量（dh 负向下限）
        const dh = Math.max(Math.min(dy, maxShrink), -topLimit)
        newH -= dh; this.panelY += dh
      }
      this.panelWidth = Math.round(newW)
      this.panelHeight = Math.round(newH)
      this._applyColumns()
    }
    this.resizeUpHandler = () => {
      // 记录「用户意图尺寸」供切换 pane 后重新裁剪，并持久化
      this._storedWidth = this.panelWidth
      this._storedHeight = this.panelHeight || 0
      // #10 修复：try-catch 防止 QuotaExceededError
      try {
        localStorage.setItem('qc-plus-panel-width', String(this._storedWidth))
        localStorage.setItem('qc-plus-panel-height', String(this._storedHeight))
      } catch (e) { console.warn('[QC+] resize localStorage failed', e) }
      this.resizing = null
      this.cleanResize()
    }
    document.addEventListener('mousemove', this.resizeMoveHandler)
    document.addEventListener('mouseup', this.resizeUpHandler)
  }

  private cleanResize(): void {
    if (this.resizeMoveHandler) { document.removeEventListener('mousemove', this.resizeMoveHandler); this.resizeMoveHandler = null }
    if (this.resizeUpHandler) { document.removeEventListener('mouseup', this.resizeUpHandler); this.resizeUpHandler = null }
  }

  private restorePosition(): void {
    const hostEl = this.terminalHostEl || (this.terminalRef?.element?.nativeElement as HTMLElement | null)

    // 默认先使用「贴近入口」的坐标（装饰器在 togglePanel 阶段已算好 panelX/panelY）
    // 仅当「保存位置」在当前 hostEl 的可视范围内时才采纳并覆盖——确保 split 场景
    // 下从任意 pane 打开都能贴在当前 pane 入口旁，不会跑到另一个 pane 的屏坐标。
    const saved = this._readPosFromSaved()
    if (hostEl && this._isPosInsideHost(saved.x, saved.y, hostEl)) {
      this.panelX = Math.max(0, saved.x); this.panelY = Math.max(0, saved.y)
    }
    // 否则保留 togglePanel 阶段 positionPanelNearEntry 已算好的入口旁坐标

    // 边界约束：打开即把尺寸+位置裁剪进当前 pane（拆分窄窗下不溢出，对齐 SFTP+）
    setTimeout(() => this.clampToHostPane(hostEl), 0)
  }

  /**
   * 把面板几何（尺寸 + 位置）约束到所属 pane 内 —— 拆分窗口自适应，对齐 SFTP+ 的做法。
   * 只更新渲染值（panelWidth/panelHeight/autoMaxHeight/panelX/panelY），**不写回存储**：
   * 存储保留用户意图尺寸（_stored*），这样换个更宽的 pane 打开时能恢复原尺寸，
   * 而不是像「把窄 pane 压缩值写回全局」那样越开越小（SFTP+ 已踩过的串味坑）。
   * 调用时机：打开/恢复面板、拆分比例或窗口尺寸变化时。
   */
  clampToHostPane(hostEl?: HTMLElement | null): void {
    const el = hostEl || this.terminalHostEl || (this.terminalRef?.element?.nativeElement as HTMLElement | null)
    if (!el) return
    const r = el.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return
    const pad = 4
    // pane 可用空间（pane 比面板下限还窄时退化为 pane 尺寸，不再强撑最小值）
    const availW = Math.max(160, r.width - pad * 2)
    const availH = Math.max(120, r.height - pad * 2)
    this.panelWidth = Math.round(Math.min(this._storedWidth || 320, availW))
    this.panelHeight = this._storedHeight ? Math.round(Math.min(this._storedHeight, availH)) : 0
    this.autoMaxHeight = Math.round(Math.min(420, availH))
    // 位置：完全落回 pane 矩形内
    const pw = this.panelWidth || 320
    const ph = this.panelHeight || this.autoMaxHeight
    this.panelX = Math.round(Math.max(r.left + pad, Math.min(this.panelX, Math.max(r.left + pad, r.right - pw - pad))))
    this.panelY = Math.round(Math.max(r.top + pad, Math.min(this.panelY, Math.max(r.top + pad, r.bottom - ph - pad))))
    this._applyColumns()
  }

  /** 列表列模式：'1' = 单列；'multi' = 由 CSS grid auto-fill 自适应列数 */
  _cols: '1' | 'multi' = '1'

  /**
   * 按当前宽度决定列表是否进入多列模式。列数不再按固定阈值分 2/3 档，
   * 而是交给 CSS `grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))` 自适应 ——
   * 面板越宽列数越多，横向空间用得更满。
   * 不用 column-count：固定高度的滚动容器里多列会向右侧溢出而不是纵向滚动。
   */
  private _applyColumns(): void {
    const next: '1' | 'multi' = (this.panelWidth || 320) >= 500 ? 'multi' : '1'
    if (next !== this._cols) this._cols = next
  }

  /** 判断绝对坐标 (x, y) 是否落在 hostEl 的可视矩形内（包含宽度/高度容差） */
  private _isPosInsideHost(x: number, y: number, hostEl: HTMLElement): boolean {
    const r = hostEl.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return false
    const panelW = this.panelWidth || 320
    const panelH = this.panelHeight || 200
    return (
      x >= r.left - 4 &&
      x + panelW <= r.right + 4 &&
      y >= r.top - 4 &&
      y + panelH <= r.bottom + 4
    )
  }

  /** 关闭/销毁时持久化当前面板位置（全局统一） */
  private savePosMemory(): void {
    this.svc.savePanelPosition({ x: this.panelX, y: this.panelY })
  }

  /**
   * 拖拽结束时持久化位置（全局统一：之后打开的面板套用同一份坐标）。
   * 刻意**不**向其它已打开的面板广播 —— 早先会派发 qc-plus-global-pos-changed 让所有面板实时跟随，
   * 导致拆分窗口里同时开着多份面板时，拖任意一个都会把其余面板一起挪走（非用户预期）。
   * 位置统一只应在「打开时」生效，各面板运行期间位置相互独立。
   */
  private _saveCurrentPosToGlobal(): void {
    this.svc.savePanelPosition({ x: this.panelX, y: this.panelY })
  }

  private _readPosFromSaved(): { x: number; y: number } {
    const saved = this.svc.getPanelPosition()
    return { x: saved.x, y: saved.y }
  }

  doClose(): void {
    if (!this.profileId) this.initTerminalInfo()
    this.savePosMemory()
    if (this.onClose) this.onClose()
  }

  /** 面板根：阻止鼠标事件冒泡到终端；顺带收起展开中的分组下拉 */
  noBubble(event: MouseEvent): void {
    if (this.filterMenuOpen) this.filterMenuOpen = false
    event.stopPropagation()
  }
}