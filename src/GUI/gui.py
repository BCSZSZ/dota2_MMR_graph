import tkinter as tk
from tkinter import ttk
import sys
import json

sys.path.append( '..' )
from src.backend import backend

class CapturePrints:
    def __init__(self):
        self.contents = []

    def write(self, text):
        self.contents.append(text)

    def get_contents(self):
        return "".join(self.contents)

class GUI:
    def __init__(self, master):
        self.master = master
        master.title("政审小工具")  # 设置窗口标题
        master.geometry("640x480")  # 设置窗口大小
        
        # 创建 Notebook
        self.notebook = ttk.Notebook(master)
        self.notebook.pack(expand=True, fill="both")

        # 第一个标签页
        self.tab1 = ttk.Frame(self.notebook)
        self.notebook.add(self.tab1, text="标准政审")
        self.create_first_tab(self.tab1)

        # 第二个标签页
        self.tab2 = ttk.Frame(self.notebook)
        self.notebook.add(self.tab2, text="最近20把深度分析")
        self.create_second_tab(self.tab2)        
        
        
    def create_first_tab(self, master):
        
        # radiobutton
        self.choice_var = tk.StringVar(value="dropdown")  # 默认选择dropdown

        rb_dropdown = tk.Radiobutton(master, text="从下拉菜单选择", variable=self.choice_var, value="dropdown", command=self.toggle_input_method)
        rb_dropdown.grid(row=0, column=0, sticky='w', padx=10, pady=10)

        rb_manual = tk.Radiobutton(master, text="手动输入", variable=self.choice_var, value="manual", command=self.toggle_input_method)
        rb_manual.grid(row=0, column=1, sticky='w', padx=10, pady=10)        
                
        # maunal input ID and name
        self.label_player_name_param = tk.Label(master, text="怎么称呼？")
        self.label_player_name_param.grid(row=1, column=0, sticky='w', padx=10, pady=0)  # pady doubled

        self.entry_player_name_param = tk.Entry(master)
        self.entry_player_name_param.grid(row=1, column=1, sticky='w', padx=10, pady=0)  # pady doubled

        self.label_accout_ID_param = tk.Label(master, text="dota2ID")
        self.label_accout_ID_param.grid(row=2, column=0, sticky='w', padx=10, pady=0)  # pady doubled
        
        self.entry_accout_ID_param = tk.Entry(master)
        self.entry_accout_ID_param.grid(row=2, column=1, sticky='w', padx=10, pady=0)  # pady doubled
        
        # drop down input
        self.label_logged_player_name = tk.Label(master, text="已登录玩家名")
        self.label_logged_player_name.grid(row=3, column=0, sticky='w', padx=10, pady=10)  

        json_path=backend.get_accountID_path()
        
        data = {}
        try:
            with open(json_path, 'r') as json_file:
                data = json.load(json_file)
        except (FileNotFoundError, json.JSONDecodeError):  # 文件不存在或JSON解码失败
            pass

        self.logged_player_name_values = data  # 使用json文件中的键作为下拉框的值
        self.logged_player_name_var = tk.StringVar(master)
        self.combo_logged_player_name = ttk.Combobox(master, textvariable=self.logged_player_name_var, values=list(self.logged_player_name_values.keys()))
        self.combo_logged_player_name.grid(row=3, column=1, sticky='w', padx=10, pady=10)


        self.label_limit_param = tk.Label(master, text="抽取多少把比赛？")
        self.label_limit_param.grid(row=4, column=0, sticky='w', padx=10, pady=10)  # pady doubled

        self.entry_limit_param = tk.Entry(master)
        self.entry_limit_param.grid(row=4, column=1, sticky='w', padx=10, pady=10)  # pady doubled

        self.label_lobby_type_param = tk.Label(master, text="比赛类型是？")
        self.label_lobby_type_param.grid(row=5, column=0, sticky='w', padx=10, pady=10)  # pady doubled

        self.dropdown_values = {
            "天梯": 7,
            "普通": 0,
            "全部": -1
        }

        self.dropdown_var = tk.StringVar(master)
        self.dropdown_var.set("天梯")  # 设置默认选项
        self.dropdown_menu = ttk.Combobox(master, textvariable=self.dropdown_var, values=list(self.dropdown_values.keys()))
        self.dropdown_menu.grid(row=5, column=1, sticky='w', padx=10, pady=10)  # pady doubled

        self.submit_button = tk.Button(master, text="一键政审！", command=self.submit)
        self.submit_button.grid(row=6, column=1, sticky='w', padx=10, pady=20)  # Increased pady for more spacing

        self.result_text = tk.Text(master, wrap=tk.WORD, width=40, height=10)
        self.result_text.grid(row=0, column=2, rowspan=8, padx=(10,20), pady=(5,20), sticky='nsew')  # Added right and bottom padding

        # 设置默认值
        self.entry_limit_param.insert(0, "1000")

        # Adjust the grid weights to allow the text box to expand
        master.grid_rowconfigure(6, weight=1)  # This will allow the last row to expand
        master.grid_columnconfigure(2, weight=1)  # This will allow the third column to expand
        self.toggle_input_method()  # 使初始配置生效
        
    def create_second_tab(self, master):
        pass              
        
    
    def submit(self):
        limit_param = self.entry_limit_param.get()
        lobby_type_param = self.dropdown_values[self.dropdown_var.get()]      
        
        choice = self.choice_var.get()
        if choice == "dropdown":
            player_name_param = self.logged_player_name_var.get()
            accout_ID_param = str(self.logged_player_name_values[player_name_param])
        else:
            player_name_param = self.entry_player_name_param.get()
            accout_ID_param = self.entry_accout_ID_param.get()        
            
          
        capture_prints = CapturePrints()
        original_stdout = sys.stdout  # 保存原始stdout
        sys.stdout = capture_prints   # 重定向print输出

        # 调用后端逻辑
        self.call_backend_logic(player_name_param, accout_ID_param, limit_param, lobby_type_param)

        sys.stdout = original_stdout  # 恢复原始stdout

        output = capture_prints.get_contents()
        
        # delete the first 4 line
        lines = output.split('\n')
        del lines[0:4]
        output = '\n'.join(lines)
        
        print(output)

        # 在Text小部件中显示捕获的输出
        self.result_text.delete(1.0, tk.END)  # 清空Text小部件内容
        self.result_text.insert(tk.END, output)  # 插入新文本
        
    def toggle_input_method(self):
        choice = self.choice_var.get()
        if choice == "dropdown":
            self.entry_player_name_param.config(state=tk.DISABLED)
            self.entry_accout_ID_param.config(state=tk.DISABLED)
            self.combo_logged_player_name.config(state=tk.NORMAL)
        else:
            self.entry_player_name_param.config(state=tk.NORMAL)
            self.entry_accout_ID_param.config(state=tk.NORMAL)
            self.combo_logged_player_name.config(state=tk.DISABLED)        
        
        
        
    def call_backend_logic(self, player_name_param, accout_ID_param, limit_param, lobby_type_param):
        """call the back end function.

        Args:
            player_name_param (_type_): _description_
            accout_ID_param (_type_): _description_
            limit_param (_type_): _description_
            lobby_type_param (_type_): _description_

        Returns:
            _type_: _description_
        """
        result_text=backend.analyze_custom_input(player_name_param,accout_ID_param,limit_param,lobby_type_param)
        return result_text

if __name__ == "__main__":
    root = tk.Tk()
    gui = GUI(root)
    root.mainloop()
