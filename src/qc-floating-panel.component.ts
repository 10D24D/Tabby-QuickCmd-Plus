/**
 * QuickCommand+ 浮动面板组件
 * 功能描述：浮动在终端上的快捷命令面板，支持搜索/分组/执行/最小化/拖拽
 * 创建人：DD1024z + Deepseek-V4-Flash
 * 创建时间：2026-06-26
 */
import { Component, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core'
import { QuickCommandService, QuickCommand, QuickCommandGroup, CommandStep, resolveSteps, PositionMemoryData } from './qc-command.service'
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
      [style.max-height.px]="panelHeight ? null : 420"
      (mousedown)="noBubble($event)">

      <!-- 标题栏（可拖拽） -->
      <div class="qc-titlebar"
        (mousedown)="startDrag($event)">
        <span class="qc-title">{{ i18n.t('app.title') }}</span>
        <span class="qc-ssh-label" *ngIf="sshHost">{{ sshHost }}</span>
        <div class="qc-title-actions">
          <span class="qc-action qc-action-memory"
            [title]="posMemoryOn ? i18n.t('panel.memory_on') : i18n.t('panel.memory_off')"
            (click)="togglePosMemory(); $event.stopPropagation()">{{ posMemoryOn ? '&#x2605;' : '&#x2606;' }}</span>
          <span class="qc-action qc-action-close" title="{{ i18n.t('panel.close') }}" (click)="doClose(); $event.stopPropagation()">&#x2715;</span>
        </div>
      </div>

      <!-- 搜索栏 + 分组筛选 -->
      <div class="qc-search" *ngIf="!minimized">
        <div class="qc-search-row">
          <select class="qc-filter-select" [(ngModel)]="filterGroup" (ngModelChange)="onSearch()">
            <option value="">{{ i18n.t('app.all_groups') }}</option>
            <option *ngFor="let g of allGroups" [value]="g.name || '__ungrouped__'">{{ g.name || i18n.t('app.ungrouped') }}</option>
          </select>
          <input class="qc-search-input" type="text"
            [placeholder]="i18n.t('app.search')"
            [(ngModel)]="searchText"
            (input)="onSearch()"
            (keydown.enter)="executeFirst()"
            (keydown.escape)="doClose()">
          <span class="qc-search-clear" *ngIf="searchText" (click)="searchText=''; onSearch()">&#x2715;</span>
        </div>
      </div>

      <!-- 快速入口区（固定命令） -->
      <div class="qc-quick-bar" *ngIf="!minimized && pinnedCommands.length > 0" (wheel)="onQuickBarWheel($event)">
        <div class="qc-quick-cmd" *ngFor="let pcmd of pinnedCommands"
          (click)="executeCommand(pcmd)" [title]="pcmd.text">
          <span class="qc-quick-name">{{ pcmd.name }}</span>
        </div>
      </div>

      <!-- 命令列表 -->
      <div class="qc-list" *ngIf="!minimized" #listRef>
        <!-- 按分组渲染 -->
        <ng-container *ngFor="let group of displayGroups; let gi = index">
          <div class="qc-group-header"
            (click)="toggleGroup(group.name)"
            dragover="event.preventDefault()"
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
              (drop)="onDrop($event, cmd)">
              <span class="qc-cmd-drag" draggable="true"
                (dragstart)="onDragStart($event, cmd)"
                (dragend)="onDragEnd($event)" [title]="i18n.t('panel.drag_reorder')">⋮⋮</span>
              <div class="qc-cmd-body">
                <span class="qc-cmd-name">{{ cmd.name }}</span>
                <span class="qc-cmd-preview" [title]="cmd.text">{{ getPreview(cmd) }}</span>
              </div>
              <span class="qc-cmd-badge" *ngIf="cmd.params && cmd.params.length > 0" title="Has parameters">{{ getParamBadge(cmd) }}</span>
              <span class="qc-cmd-shortcut-badge" *ngIf="cmd.shortcut">{{ cmd.shortcut }}</span>
              <span class="qc-cmd-pinbtn" (click)="togglePin(cmd); $event.stopPropagation()"
                [title]="cmd.pinned ? i18n.t('panel.unpin') : i18n.t('panel.pin')"
                [class.active]="cmd.pinned">&#x2691;</span>
              <span class="qc-cmd-edit-btn" (click)="editCommand(cmd); $event.stopPropagation()" [title]="i18n.t('panel.edit')">&#x270E;</span>
              <span class="qc-cmd-del" (click)="deleteCommand(cmd); $event.stopPropagation()" [title]="i18n.t('panel.delete')">&#x2715;</span>
              <span class="qc-cmd-sendline" (click)="sendToLine(cmd); $event.stopPropagation()" [title]="i18n.t('panel.send_to_line')">&#x21E7;</span>
              <span class="qc-cmd-execute" (click)="executeAlways(cmd); $event.stopPropagation()" [title]="i18n.t('panel.send_and_exec')">&#x23CE;</span>
            </div>
            <div class="qc-drop-end" [class.drag-over]="listDropOver"></div>
          </div>
        </ng-container>

        <!-- 空状态 -->
        <div class="qc-empty" *ngIf="filteredCommands.length === 0 && searchText">
          {{ i18n.t('app.noresults') }}
        </div>
        <div class="qc-empty" *ngIf="filteredCommands.length === 0 && !searchText">
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
    <div class="qc-edit-modal" *ngIf="showEditModal" (click)="$event.stopPropagation()">
      <div class="qc-edit-title">{{ editCmd?.id ? i18n.t('settings.edit_cmd') : i18n.t('panel.add') }}</div>
      <div class="qc-edit-field">
        <label>{{ i18n.t('settings.name') }}</label>
        <input class="qc-edit-input" type="text" [(ngModel)]="editCmd.name" (keydown.enter)="saveEditCmd()" placeholder="e.g. git status">
      </div>

      <!-- 命令步骤列表 -->
      <div class="qc-steps-label">{{ i18n.t('settings.text') }}</div>
      <div class="qc-step-row" *ngFor="let step of editCmdSteps; let i = index"
        (dragover)="onStepDragOver($event, i)"
        (dragleave)="onStepDragLeave($event)"
        (drop)="onStepDrop($event, i)"
        [class.dragging]="stepDragIdx === i">
        <span class="qc-step-drag" draggable="true"
          (dragstart)="onStepDragStart($event, i)"
          (dragend)="onStepDragEnd($event)" [title]="i18n.t('panel.drag_reorder')">⋮⋮</span>
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
    <div class="qc-edit-modal" *ngIf="showGroupRename" (click)="$event.stopPropagation()">
      <div class="qc-edit-title">{{ groupRenameIsNew ? i18n.t('group.add') : i18n.t('group.edit') }}</div>
      <div class="qc-edit-field">
        <label>{{ i18n.t('group.name') }}</label>
        <input class="qc-edit-input" type="text" [(ngModel)]="groupRenameValue"
          (keydown.enter)="confirmGroupRename()" [placeholder]="i18n.t('group.name')" autofocus>
      </div>
      <div class="qc-edit-field">
        <label>{{ i18n.t('group.order') }}</label>
        <input class="qc-edit-input" type="number" min="0" step="1" [(ngModel)]="groupRenameOrder"
          (keydown.enter)="confirmGroupRename()" placeholder="0">
      </div>
      <div class="qc-edit-footer">
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
  `,
  styles: [`
    :host { display: contents; }
    /* 颜色主题变量放在 :host 上，确保面板内所有弹窗（如 .qc-edit-modal）都能继承 */
    :host {
      --_bg: var(--qc-bg, #313244);
      --_text: var(--qc-text, #cdd6f4);
      --_primary: var(--qc-primary, #b4befe);
      --_border: var(--qc-border, #585b70);
      --_surface: var(--qc-surface, #45475a);
      --_hover: var(--qc-hover, #585b70);
      --_input-bg: var(--qc-input-bg, #1e1e2e);
      --_text-muted: var(--qc-text-muted, #6c7086);
      --_text-secondary: #a6adc8;
      --_warning: #fab387;
    }
    .qc-panel {
      position: absolute;
      z-index: 99999;
      width: 320px;
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
    }
    .qc-panel.minimized {
      width: auto;
      height: auto;
      box-shadow: none;
    }
    /* 调整大小手柄 */
    .qc-resize-e, .qc-resize-w { position:absolute; top:0; bottom:0; width:6px; cursor:ew-resize; z-index:1; }
    .qc-resize-e { right:0; }
    .qc-resize-w { left:0; }
    .qc-resize-s, .qc-resize-n { position:absolute; left:0; right:0; height:6px; cursor:ns-resize; z-index:1; }
    .qc-resize-s { bottom:0; }
    .qc-resize-n { top:0; }
    .qc-resize-se, .qc-resize-sw, .qc-resize-ne, .qc-resize-nw { position:absolute; width:12px; height:12px; z-index:2; }
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
    .qc-title { font-weight: 500; font-size: 1em; color: var(--_text, #cdd6f4); }
    .qc-ssh-label { margin-left: 8px; font-size: .85em; color: var(--_text-muted, #6c7086); }
    .qc-title-actions { margin-left: auto; display: flex; gap: 4px; }
    .qc-action {
      cursor: pointer; padding: 2px 5px; font-size: 14px; line-height:1;
      color: var(--_text-muted, #6c7086); border-radius: 4px;
    }
    .qc-action:hover { background: rgba(255,255,255,0.1); color: var(--_text, #cdd6f4); }
    .qc-action-memory { font-size: 15px; line-height:1; }
    .qc-action-memory:hover { color: #f9e2af; }
    .qc-action-close:hover { background: rgba(255,0,0,0.3); color: #f38ba8; }
    /* 搜索栏 */
    .qc-search {
      padding: 6px 10px; flex-shrink: 0; overflow: hidden;
    }
    .qc-search-row {
      display:flex; gap:4px; align-items:center; min-width:0;
    }
    .qc-search-input {
      flex:1; padding: 7px 8px 7px 8px; min-width:0; box-sizing:border-box;
      background: var(--_input-bg, #1e1e2e);
      border: 0.5px solid var(--_border, #585b70);
      border-radius: 6px;
      color: var(--_text, #cdd6f4); font-size: var(--qc-font-size, 14px); outline: none; caret-color:var(--_text);
    }
    .qc-search-input::placeholder { color: var(--_text-muted, #6c7086); }
    .qc-search-clear {
      cursor: pointer; color: var(--_text-muted, #6c7086); font-size: calc(var(--qc-font-size, 14px) - 1px); flex-shrink:0;
    }
    .qc-search-clear:hover { color: var(--_text, #cdd6f4); }

    /* 分组筛选 */
    .qc-filter-select {
      width:auto; min-width:72px; max-width:160px; padding:4px 6px; box-sizing:border-box; border-radius:6px; flex-shrink:0;
      background: var(--_input-bg, #1e1e2e);
      border: 0.5px solid var(--_border, #585b70);
      color: var(--_text, #cdd6f4); font-size: var(--qc-font-size, 14px); outline:none;
      cursor:pointer;
    }
    .qc-filter-select option { color:#000; background:#fff; }
    /* 快捷入口 */
    .qc-quick-bar {
      display: flex; gap: 4px; padding: 0 10px 6px; flex-shrink: 0;
      overflow-x: auto;
    }
    .qc-quick-cmd {
      flex-shrink: 0; padding: 3px 10px; border-radius: 6px;
      background: var(--_surface, #e5e7eb);
      border: 0.5px solid var(--_primary, #b4befe);
      cursor: pointer; white-space: nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px;
    }
    .qc-quick-cmd:hover { background: var(--_hover, #585b70); }
    .qc-quick-name { font-size: var(--qc-font-size, 14px); color: var(--_text, #cdd6f4); font-weight: 500; }
    /* 命令列表 */
    .qc-list {
      flex: 1; overflow-y: auto; overflow-x: hidden;
      padding: 2px 0; min-width:0;
    }
    .qc-group-header {
      display: flex; align-items: center; gap: 4px; padding: 4px 10px 4px 6px;
      cursor: pointer; font-size: .92em;
    }
    .qc-group-header:hover { background: var(--_hover, rgba(255,255,255,0.05)); }
    .qc-group-header.drag-over { border-top: 2px solid var(--_primary, #b4befe); }
    .qc-group-header.drag-over-bottom { border-bottom: 2px solid var(--_primary, #b4befe); }
    .qc-group-arrow { font-size: calc(var(--qc-font-size, 14px) - 2px); color: var(--_text-muted, #6c7086); width: 16px; flex-shrink:0; text-align:center; }
    .qc-group-name { font-weight: 500; color: var(--_text-secondary, #a6adc8); }
    .qc-group-count { color: var(--_text-muted, #585b70); font-size: calc(var(--qc-font-size, 14px) - 2px); }
    .qc-group-add {
      margin-left: auto; cursor: pointer; font-size: var(--qc-font-size, 14px); font-weight: 600;
      color: var(--_text, #cdd6f4); opacity:.9; padding: 0 4px; line-height: 1;
      border-radius: 3px; visibility: hidden;
    }
    .qc-group-header:hover .qc-group-add { visibility: visible; }
    .qc-group-add:hover { color: var(--_primary, #b4befe); background: rgba(255,255,255,0.08); }
    .qc-group-edit {
      cursor: pointer; font-size: var(--qc-font-size, 14px); color: var(--_text, #cdd6f4); opacity:.9;
      padding: 0 3px; border-radius: 3px; visibility: hidden;
    }
    .qc-group-header:hover .qc-group-edit { visibility: visible; }
    .qc-group-edit:hover { color: var(--_primary, #b4befe); background: rgba(255,255,255,0.08); }
    .qc-group-del { cursor:pointer; font-size:var(--qc-font-size, 14px); color:var(--_text, #cdd6f4); opacity:.9; padding:0 3px; border-radius:3px; visibility:hidden; }
    .qc-group-header:hover .qc-group-del { visibility:visible; }
    .qc-group-del:hover { color:#e24b4a; background:rgba(226,75,74,0.12); }
    /* 命令行 */
    .qc-cmd-row {
      display: flex; align-items: center; gap: 4px;
      padding: 7px 10px 7px 6px; cursor: pointer; border-radius: 0;
    }
    .qc-cmd-row:hover, .qc-cmd-row.highlighted { background: var(--_hover, rgba(255,255,255,0.1)); }
    .qc-cmd-row.drag-over { border-top: 2px solid var(--_primary, #b4befe); }
    .qc-cmd-row.drag-over-bottom { border-bottom: 2px solid var(--_primary, #b4befe); }
    .qc-cmd-row.dragging { opacity: 0.4; }
    .qc-cmd-group-body { position:relative; }
    .qc-drop-end { height:0; transition:height .12s; }
    .qc-drop-end.drag-over { height:4px; background:var(--_primary,#b4befe); border-radius:2px; margin:2px 10px; }
    .qc-cmd-drag {
      font-size: 11px; color: var(--_text-muted, #585b70); cursor: grab; flex-shrink: 0;
      width: 14px; text-align: center; user-select: none;
    }
    .qc-cmd-drag:active { cursor: grabbing; }
    .qc-cmd-icon { font-size: 8px; flex-shrink: 0; }
    .qc-cmd-body { flex: 1; min-width: 0; }
    .qc-cmd-name { display: block; font-size: .92em; color: var(--_text, #cdd6f4); }
    .qc-cmd-preview { display: block; font-size: .77em; color: var(--_text-muted, #6c7086); font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .qc-cmd-badge { font-size: calc(var(--qc-font-size, 14px) - 3px); padding: 1px 4px; border-radius: 3px; background: var(--_warning, #fab387); color: #1e1e2e; flex-shrink: 0; }
    .qc-cmd-shortcut-badge { font-size: calc(var(--qc-font-size, 14px) - 3px); padding: 1px 4px; border-radius: 3px; background: var(--_surface, #45475a); color: var(--_text-muted, #6c7086); font-family: monospace; flex-shrink: 0; }
    .qc-cmd-execute { font-size: calc(var(--qc-font-size, 14px) + 1px); color: var(--_text, #cdd6f4); cursor: pointer; flex-shrink: 0; visibility:hidden; opacity:0; transition:opacity .12s; }
    .qc-cmd-edit-btn { font-size: var(--qc-font-size, 14px); color: var(--_text, #cdd6f4); cursor: pointer; flex-shrink: 0; margin-right: 2px; visibility:hidden; opacity:0; transition:opacity .12s; }
    .qc-cmd-row:hover .qc-cmd-edit-btn, .qc-cmd-row:hover .qc-cmd-execute,
    .qc-cmd-row:hover .qc-cmd-sendline, .qc-cmd-row:hover .qc-cmd-pinbtn,
    .qc-cmd-row:hover .qc-cmd-del { visibility:visible; opacity:1; }
    .qc-cmd-edit-btn:hover { color: var(--_primary, #89b4fa); }
    .qc-cmd-execute:hover { color: var(--_primary, #b4befe); }
    .qc-cmd-sendline { font-size: var(--qc-font-size, 14px); color: var(--_text, #cdd6f4); cursor: pointer; flex-shrink: 0; visibility:hidden; opacity:0; transition:opacity .12s; padding: 0 1px; }
    .qc-cmd-sendline:hover { color: var(--_primary, #b4befe); }
    .qc-cmd-pinbtn { font-size: var(--qc-font-size, 14px); cursor: pointer; flex-shrink: 0; padding: 0 3px; color: var(--_text, #cdd6f4); visibility:hidden; opacity:0; transition:opacity .12s; }
    .qc-cmd-pinbtn:hover { color: var(--_primary, #b4befe); }
    .qc-cmd-pinbtn.active { color: var(--_primary, #b4befe); visibility:visible; opacity:1; }
    .qc-cmd-del { font-size: var(--qc-font-size, 14px); color: var(--_text, #cdd6f4); cursor: pointer; flex-shrink: 0; visibility:hidden; opacity:0; transition:opacity .12s; padding:0 2px; }
    .qc-cmd-del:hover { color:#e24b4a; }
    /* 空状态 */
    .qc-empty { padding: 20px; text-align: center; color: var(--_text-muted, #6c7086); font-size: var(--qc-font-size, 14px); }
    /* 底部 */
    .qc-footer {
      display: flex; align-items: center; padding: 4px 10px;
      border-top: 0.5px solid var(--_border, #45475a); flex-shrink: 0;
    }
    .qc-add-btn { font-size: var(--qc-font-size, 14px); color: var(--_primary, #89b4fa); cursor: pointer; padding: 2px 4px; }
    .qc-add-btn:hover { text-decoration: underline; }
    .qc-add-group-btn { margin-left: 8px; font-size: var(--qc-font-size, 14px); color: var(--_text-muted, #6c7086); }
    .qc-add-group-btn:hover { text-decoration: underline; color: var(--_primary, #89b4fa); }
    .qc-usage-hint { margin-left: auto; font-size: calc(var(--qc-font-size, 14px) - 2px); color: var(--_text-muted, #6c7086); }

    /* 编辑弹窗 */
    .qc-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:100000; }
    .qc-edit-modal {
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
      background:var(--_bg); border:0; border-radius:12px; padding:20px; z-index:100001;
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
    .qc-edit-input:focus { border-color:var(--_primary); }
    .qc-edit-footer { display:flex; gap:6px; justify-content:flex-end; margin-top:12px; }
    .qc-edit-check { display:flex; gap:12px; margin-top:8px; }
    .qc-edit-check label { display:flex; align-items:center; gap:4px; font-size:var(--qc-font-size, 14px); color:var(--_text); cursor:pointer; }
    .qc-edit-check input { margin:0; }

    /* 命令步骤列表 */
    .qc-steps-label { font-size:calc(var(--qc-font-size, 14px) - 1px); font-weight:500; color:var(--_text-muted); margin-bottom:4px; margin-top:8px; }
    .qc-step-row { display:flex; gap:4px; align-items:center; margin-bottom:3px; }
    .qc-step-row.dragging { opacity: 0.4; }
    .qc-step-row.drag-over { border-top: 2px solid var(--_primary, #b4befe); }
    .qc-step-row.drag-over-bottom { border-bottom: 2px solid var(--_primary, #b4befe); }
    .qc-step-row.dragging { opacity: 0.4; }
    .qc-step-drag { font-size:var(--qc-font-size, 14px); color:var(--_text-muted); cursor:grab; flex-shrink:0; width:16px; text-align:center; user-select:none; }
    .qc-step-drag:active { cursor:grabbing; }
    .qc-step-type { font-size:var(--qc-font-size, 14px); cursor:pointer; flex-shrink:0; padding:1px 4px; border-radius:3px; color:var(--_primary); }
    .qc-step-type.is-break { color:#fab387; background:rgba(250,179,135,0.12); }
    .qc-step-type:hover { background:rgba(255,255,255,0.08); }
    .qc-step-input {
      flex:1; padding:7px 8px; border-radius:6px; box-sizing:border-box;
      background:var(--_input-bg); border:0.5px solid var(--_border);
      color:var(--_text); font-size:var(--qc-font-size, 14px); outline:none; resize:none;
      overflow:hidden; min-height:28px; field-sizing:content; caret-color:var(--_text);
    }
    .qc-step-input:focus { border-color:var(--_primary); }
    .qc-step-delay {
      width:64px; padding:7px 4px; border-radius:6px; box-sizing:border-box; flex-shrink:0;
      background:var(--_input-bg); border:0.5px solid var(--_border);
      color:var(--_text-muted); font-size:calc(var(--qc-font-size, 14px) - 2px); outline:none; text-align:center;
    }
    .qc-step-delay:focus { border-color:var(--_primary); color:var(--_text); }
    .qc-step-del {
      flex-shrink:0; cursor:pointer; color:var(--_text-muted); font-size:calc(var(--qc-font-size, 14px) - 1px); padding:2px 6px; border-radius:4px;
    }
    .qc-step-del:hover { color:#e24b4a; background:rgba(226,75,74,0.12); }
    .qc-step-break-label { font-size:var(--qc-font-size, 14px); color:#fab387; font-weight:500; padding:0 4px; flex:1; }
    .qc-step-actions { display:flex; gap:12px; margin-top:2px; }
    .qc-step-add { font-size:var(--qc-font-size, 14px); color:var(--_primary); cursor:pointer; padding:2px 0; }
    .qc-step-add:hover { text-decoration:underline; }
    .qc-step-add-break { color:#fab387; }
    .qc-edit-btn {
      padding:5px 14px; border-radius:6px; border:0.5px solid var(--_border);
      background:var(--_surface); color:var(--_text);
      font-size:var(--qc-font-size, 14px); cursor:pointer;
    }
    .qc-edit-btn:hover { background:var(--_hover); }
    .qc-edit-btn-primary { background:var(--_primary); color:#1e1e2e; border-color:var(--_primary); }
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
      background: var(--_border, #585b70);
      border-radius: 3px;
    }
    .qc-list::-webkit-scrollbar-thumb:hover,
    .qc-quick-bar::-webkit-scrollbar-thumb:hover {
      background: var(--_text-muted, #6c7086);
    }
  `],
})
export class QuickCommandFloatingPanel implements OnInit, OnDestroy {
  @ViewChild('listRef') listRef!: ElementRef

  svc = new QuickCommandService()
  i18n = new QuickCommandI18nService()

  private destroyed = false
  minimized = false
  panelX = 20
  panelY = 60
  /** 面板宽度，从 localStorage 恢复，默认 320 */
  panelWidth: number = +(localStorage.getItem('qc-plus-panel-width') || '320')
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

  posMemoryOn = false

  private dragging = false
  private dragOffsetX = 0
  private dragOffsetY = 0
  private dragMoveHandler: any = null
  private dragUpHandler: any = null

  get allGroups(): QuickCommandGroup[] {
    return this.groups
  }

  get displayGroups(): QuickCommandGroup[] {
    return this.groups.filter(g => {
      if (this.filterGroup === '__ungrouped__') {
        if (g.name !== '') return false
      } else if (this.filterGroup) {
        if (g.name !== this.filterGroup) return false
      }
      if (this.searchText) {
        const cmds = this.getGroupCommands(g.name)
        return cmds.length > 0
      }
      return true
    })
  }

  get selectedCount(): number {
    return this.filteredCommands.length
  }

  ngOnInit(): void {
    this.loadData()
    this.initTerminalInfo()
    window.addEventListener('qc-plus-locale-changed', this.onLocaleChanged)
    window.addEventListener('qc-plus-data-changed', this.onDataChanged)
  }

  applyPositionMemory(): void {
    this.initTerminalInfo()
    this.posMemoryOn = this.profileId ? this.svc.hasPositionMemory(this.profileId) : false
    this.restorePosition()
    this.loadData()
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
    this.cleanDrag()
    this.cleanResize()
  }

  private onLocaleChanged = (): void => {
    this.i18n = new QuickCommandI18nService()
    this.loadData()
  }

  private onDataChanged = (): void => {
    this.loadData()
  }

  loadData(): void {
    this.svc.reload()
    this.commands = this.svc.getAll()
    this.groups = this.svc.getGroups()
    this.pinnedCommands = this.svc.getPinned()
    if (this.filterGroup) {
      const valid = this.groups.some(g =>
        this.filterGroup === '__ungrouped__' ? !g.name : g.name === this.filterGroup
      )
      if (!valid) this.filterGroup = ''
    }
    this.onSearch()
  }

  onSearch(): void {
    let filtered = this.commands
    if (this.searchText) {
      const q = this.searchText.toLowerCase()
      filtered = filtered.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.text || '').toLowerCase().includes(q)
      )
    }
    if (this.filterGroup === '__ungrouped__') {
      filtered = filtered.filter(c => !c.group)
    } else if (this.filterGroup) {
      filtered = filtered.filter(c => c.group === this.filterGroup)
    }
    this.filteredCommands = filtered
  }

  getGroupCommands(groupName: string): QuickCommand[] {
    return this.filteredCommands.filter(c => (c.group || '') === (groupName || ''))
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

  confirmParamModal(): void {
    if (!this.paramModalCmd) return
    let text = this.paramModalCmd.text
    for (const p of this.paramModalParams) {
      const val = this.paramModalValues[p] || ''
      text = text.split('${' + p + '}').join(val)
    }
    this.sendCommand(this.paramModalCmd, text, this.paramModalForceExecute)
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

  private sendCommand(cmd: QuickCommand, text: string, forceExecute = false): void {
    this.svc.incrementUsage(cmd.id)
    const steps = resolveSteps({ ...cmd, steps: cmd.steps, text })
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
    if (this.destroyed) return
    if (idx >= steps.length) {
      this.focusTerminal()
      return
    }

    const step = steps[idx]
    const line = step.text
    const isLast = idx === steps.length - 1
    const appendLine = forceExecute ? true : (isLast ? (cmd.appendCR !== false) : true)

    // break 类型：发送 Ctrl+C 中断
    if (step.type === 'break') {
      // 延时执行：给 pty 行规程足够时间处理上一步的 \n
      // 防止 \x03 在同一个 n_tty_receive_buf 调用中覆盖 \n 的效果
      setTimeout(() => {
        this.sendRawBreak(() => {
          const nextDelay = step.delaySeconds || 0
          if (nextDelay > 0) { setTimeout(() => this.executeSteps(cmd, steps, idx + 1, forceExecute), nextDelay * 1000) }
          else { this.executeSteps(cmd, steps, idx + 1, forceExecute) }
        })
      }, 150)
      return
    }

    try {
      let sent = false
      if (typeof this.terminalRef.sendInput === 'function') {
        this.terminalRef.sendInput(line)
        if (appendLine) this.terminalRef.sendInput('\n')
        sent = true
      } else if (typeof this.terminalRef.write === 'function') {
        this.terminalRef.write(line)
        if (appendLine) this.terminalRef.write('\n')
        sent = true
      } else {
        const ssh = this.terminalRef?.sshSession ?? this.terminalRef?._session ?? null
        if (ssh && typeof ssh.write === 'function') { ssh.write(line); if (appendLine) ssh.write('\n'); sent = true }
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
      if (!sent && idx === 0) console.warn('[QC+] No terminal input method available')
      if (idx + 1 < steps.length) {
        const nextDelay = step.delaySeconds || 0
        if (nextDelay > 0) { setTimeout(() => this.executeSteps(cmd, steps, idx + 1, forceExecute), nextDelay * 1000) }
        else { this.executeSteps(cmd, steps, idx + 1, forceExecute) }
      } else {
        // 所有步骤执行完毕，进入 idx>=length 守卫回收焦点
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

  showMultiStepHint = false
  multiStepCount = 0
  private multiStepCmd: QuickCommand | null = null

  addCommand(): void {
    this.editCmd = { name: '', text: '', group: '', appendCR: true, pinned: false, steps: [{ text: '', delaySeconds: 0, type: 'command' }] }
    this.showEditModal = true
  }

  addCommandToGroup(groupName: string): void {
    this.editCmd = { name: '', text: '', group: groupName || '', appendCR: true, pinned: false, steps: [{ text: '', delaySeconds: 0, type: 'command' }] }
    this.showEditModal = true
  }

  editCommand(cmd: QuickCommand): void {
    this.editCmd = JSON.parse(JSON.stringify(cmd))
    if (!this.editCmd.steps || this.editCmd.steps.length === 0) {
      if (this.editCmd.text) {
        const lines = this.editCmd.text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0)
        const globalDelay = this.editCmd.delaySeconds || 0
        this.editCmd.steps = lines.map((line: string, i: number) => ({ text: line, delaySeconds: i < lines.length - 1 ? globalDelay : 0 }))
      } else { this.editCmd.steps = [{ text: '', delaySeconds: 0 }] }
    }
    this.showEditModal = true
    // 等待 DOM 渲染后自动调整 textarea 高度
    setTimeout(() => {
      document.querySelectorAll('.qc-step-input').forEach(el => {
        const ta = el as HTMLTextAreaElement
        if (ta.scrollHeight > ta.clientHeight) {
          ta.style.height = ta.scrollHeight + 'px'
        }
      })
    }, 50)
  }

  togglePin(cmd: QuickCommand): void {
    this.svc.update(cmd.id, { pinned: !cmd.pinned })
    cmd.pinned = !cmd.pinned
    this.loadData()
  }

  onResetUsage(): void {
    if (!this.editCmd?.id) return
    this.svc.update(this.editCmd.id, { usageCount: 0 })
    this.editCmd.usageCount = 0
  }

  get editCmdSteps(): CommandStep[] { return this.editCmd?.steps || [] }
  set editCmdSteps(v: CommandStep[]) { this.editCmd.steps = v }

  addStep(): void { this.editCmd.steps.push({ text: '', delaySeconds: 0, type: 'command' }) }

  addBreakStep(): void { this.editCmd.steps.push({ text: '', delaySeconds: 1, type: 'break' }) }

  autoGrow(event: Event): void {
    const ta = event.target as HTMLTextAreaElement
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
      name: this.editCmd.name.trim(), text: text.trim(), group: this.editCmd.group || '',
      appendCR: this.editCmd.appendCR !== false, pinned: !!this.editCmd.pinned,
      sendCtrlC: false, sendCtrlCAfter: false, // 步骤模式下清除旧版兼容字段，避免 resolveSteps 追加重复 break
      steps: steps.map((s: CommandStep) => ({ text: s.text, delaySeconds: Math.max(0, +(s.delaySeconds || 0)), type: s.type || 'command' })),
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
    event.dataTransfer?.setData('text/plain', cmd.id)
    event.dataTransfer!.effectAllowed = 'move'
  }

  onDragOver(event: DragEvent): void {
    event.preventDefault()
    event.dataTransfer!.dropEffect = 'move'
    const el = event.currentTarget as HTMLElement
    const y = event.clientY - el.getBoundingClientRect().top
    const dropBottom = y > el.offsetHeight / 2
    document.querySelectorAll('.qc-cmd-row.drag-over, .qc-cmd-row.drag-over-bottom, .qc-group-header.drag-over').forEach(r => r.classList.remove('drag-over', 'drag-over-bottom'))
    el.classList.add(dropBottom ? 'drag-over-bottom' : 'drag-over')
  }

  onDragLeave(event: DragEvent): void { (event.currentTarget as HTMLElement).classList.remove('drag-over', 'drag-over-bottom') }

  onDrop(event: DragEvent, targetCmd: QuickCommand): void {
    event.preventDefault(); this.cleanDragStyles()
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
    this.loadData()
  }

  onDropToGroup(event: DragEvent, groupName: string): void {
    event.preventDefault(); this.cleanDragStyles()
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
    this.loadData()
  }

  onDragEnd(event: DragEvent): void { this.dragCmdId = null; this.cleanDragStyles(); this.listDropOver = false }

  onListDragOver(event: DragEvent): void {
    event.preventDefault()
    event.dataTransfer!.dropEffect = 'move'
    this.listDropOver = true
  }

  onListDragLeave(event: DragEvent): void {
    this.listDropOver = false
  }

  onListDrop(event: DragEvent, groupName: string): void {
    event.preventDefault()
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
    this.loadData()
  }

  private cleanDragStyles(): void {
    document.querySelectorAll('.qc-cmd-row.dragging, .qc-cmd-row.drag-over, .qc-cmd-row.drag-over-bottom, .qc-group-header.drag-over')
      .forEach(el => el.classList.remove('dragging', 'drag-over', 'drag-over-bottom'))
  }

  showGroupRenameDialog(oldName: string): void {
    this.groupRenameIsNew = false; this.groupRenameOldName = oldName; this.groupRenameValue = oldName
    const g = this.svc.getGroups().find(gr => gr.name === oldName)
    this.groupRenameOrder = g?.order ?? 0
    this.showGroupRename = true
  }

  deleteGroup(name: string): void {
    if (name && !confirm(this.i18n.t('group.delete_confirm', { name }))) return
    this.svc.removeGroup(name)
    this.loadData()
  }

  deleteCommand(cmd: QuickCommand): void {
    if (!confirm(this.i18n.t('panel.delete_confirm', { name: cmd.name }))) return
    this.svc.remove(cmd.id)
    this.loadData()
  }

  confirmGroupRename(): void {
    const newName = this.groupRenameValue?.trim()
    if (this.groupRenameIsNew) {
      if (newName) this.svc.addGroup(newName, this.groupRenameOrder)
    } else {
      if (!newName || newName === this.groupRenameOldName) {
        // 名称没变，只更新排序
        this.svc.updateGroupOrder(this.groupRenameOldName, this.groupRenameOrder)
        this.closeGroupRename(); this.loadData(); return
      }
      this.svc.renameGroup(this.groupRenameOldName, newName)
      this.svc.updateGroupOrder(newName, this.groupRenameOrder)
    }
    this.closeGroupRename(); this.loadData()
  }

  closeGroupRename(): void { this.showGroupRename = false; this.groupRenameIsNew = false; this.groupRenameOldName = ''; this.groupRenameValue = ''; this.groupRenameOrder = 0 }

  addNewGroup(): void { this.groupRenameIsNew = true; this.groupRenameOldName = ''; this.groupRenameValue = ''; this.groupRenameOrder = 0; this.showGroupRename = true }

  startDrag(event: MouseEvent): void {
    if (event.button !== 0) return
    this.dragging = true
    this.dragOffsetX = event.clientX - this.panelX
    this.dragOffsetY = event.clientY - this.panelY
    const hostEl = this.terminalRef?.element?.nativeElement as HTMLElement | null
    this.dragMoveHandler = (ev: MouseEvent) => {
      if (!this.dragging) return
      let x = ev.clientX - this.dragOffsetX
      let y = ev.clientY - this.dragOffsetY
      if (hostEl) {
        const panelEl = hostEl.querySelector('.qc-panel') as HTMLElement | null
        const ph = panelEl?.offsetHeight || 200; const pw = panelEl?.offsetWidth || 320
        const maxX = Math.max(0, hostEl.clientWidth - pw - 4); const maxY = Math.max(0, hostEl.clientHeight - ph - 4)
        x = Math.max(0, Math.min(x, maxX)); y = Math.max(0, Math.min(y, maxY))
      }
      this.panelX = x; this.panelY = y
    }
    this.dragUpHandler = () => {
      this.dragging = false
      if (this.posMemoryOn && this.profileId) { this.svc.savePositionMemory(this.profileId, { panelX: this.panelX, panelY: this.panelY }) }
      else { this.svc.savePanelPosition({ x: this.panelX, y: this.panelY }) }
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
      // 获取容器边界约束
      const hostEl = this.terminalRef?.element?.nativeElement as HTMLElement | null
      const maxW = hostEl ? hostEl.clientWidth : 9999
      const maxH = hostEl ? hostEl.clientHeight : 9999
      let newW = this.panelWidth
      let newH = this.panelHeight || this.resizing.startH
      // E/SE/NE：右边缘不超出容器
      if (dir.includes('e')) { const limit = maxW - this.panelX; newW = Math.max(300, Math.min(newW + dx, limit)) }
      // W/NW/SW：左边缘不超出容器左边界
      if (dir.includes('w')) { const maxShrink = newW - 300; const leftLimit = this.panelX; const dw = Math.max(Math.min(dx, maxShrink, leftLimit), -maxShrink); newW -= dw; this.panelX += dw }
      // S/SW/SE：下边缘不超出容器
      if (dir.includes('s')) { const limit = maxH - this.panelY; newH = Math.max(400, Math.min(newH + dy, limit)) }
      // N/NE/NW：上边缘不超出容器上边界
      if (dir.includes('n')) { const maxShrink = newH - 400; const topLimit = this.panelY; const dh = Math.max(Math.min(dy, maxShrink, topLimit), -maxShrink); newH -= dh; this.panelY += dh }
      this.panelWidth = Math.round(newW)
      this.panelHeight = Math.round(newH)
    }
    this.resizeUpHandler = () => {
      localStorage.setItem('qc-plus-panel-width', String(this.panelWidth))
      localStorage.setItem('qc-plus-panel-height', String(this.panelHeight || '0'))
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
    if (this.posMemoryOn && this.profileId) {
      const mem = this.svc.getPositionMemory(this.profileId)
      if (mem) {
        this.panelX = Math.max(0, mem.panelX || 20); this.panelY = Math.max(0, mem.panelY || 60)
        if (mem.filterGroup !== undefined) this.filterGroup = mem.filterGroup
        if (this.filterGroup && this.filterGroup !== '__ungrouped__') {
          if (!this.groups.some(g => g.name === this.filterGroup)) this.filterGroup = ''
        }
        if (mem.groupExpanded) {
          this.groups.forEach(g => { if (mem.groupExpanded[g.name] !== undefined) g.expanded = mem.groupExpanded[g.name] })
        }
        if (mem.panelScrollTop > 0) {
          setTimeout(() => { if (this.listRef?.nativeElement) this.listRef.nativeElement.scrollTop = mem.panelScrollTop }, 50)
        }
        return
      }
    }
    const saved = this.svc.getPanelPosition()
    if (saved.x !== 20 || saved.y !== 60) { this.panelX = Math.max(0, saved.x); this.panelY = Math.max(0, saved.y) }
    setTimeout(() => {
      const hostEl = this.terminalRef?.element?.nativeElement as HTMLElement | null
      if (hostEl) {
        const panelEl = hostEl.querySelector('.qc-panel') as HTMLElement | null
        const ph = panelEl?.offsetHeight || 200; const pw = panelEl?.offsetWidth || 320
        this.panelX = Math.max(0, Math.min(this.panelX, Math.max(0, hostEl.clientWidth - pw - 4)))
        this.panelY = Math.max(0, Math.min(this.panelY, Math.max(0, hostEl.clientHeight - ph - 4)))
      }
    }, 0)
  }

  private savePosMemory(): void {
    if (!this.profileId && this.terminalRef) {
      try {
        const ssh = this.terminalRef?.sshSession ?? this.terminalRef?._session ?? null
        if (this.terminalRef?.profile?.id) this.profileId = this.terminalRef.profile.id
        else if (ssh?.host) this.profileId = 'ssh:' + ssh.host
      } catch { /* ignore */ }
    }
    if (this.posMemoryOn && this.profileId) {
      const scrollTop = this.listRef?.nativeElement?.scrollTop || 0
      const groupExp: Record<string, boolean> = {}
      this.groups.forEach(g => { groupExp[g.name] = g.expanded })
      this.svc.savePositionMemory(this.profileId, {
        panelScrollTop: scrollTop > 0 ? scrollTop : undefined,
        filterGroup: this.filterGroup, groupExpanded: groupExp,
      })
    }
  }

  togglePosMemory(): void {
    if (!this.profileId) return
    this.posMemoryOn = this.svc.togglePositionMemory(this.profileId)
    if (this.posMemoryOn) {
      const groupExp: Record<string, boolean> = {}
      this.groups.forEach(g => { groupExp[g.name] = g.expanded })
      this.svc.savePositionMemory(this.profileId, {
        entryX: 0, entryY: 0, panelX: this.panelX, panelY: this.panelY,
        panelScrollTop: this.listRef?.nativeElement?.scrollTop || 0,
        filterGroup: this.filterGroup, groupExpanded: groupExp,
      })
    }
  }

  doClose(): void {
    if (!this.profileId) this.initTerminalInfo()
    this.savePosMemory()
    if (this.onClose) this.onClose()
  }

  noBubble(event: MouseEvent): void { event.stopPropagation() }
}