import tkinter as tk
from tkinter import ttk
import sys
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

        self.label_player_name_param = tk.Label(master, text="怎么称呼？")
        self.label_player_name_param.grid(row=0, column=0, sticky='w', padx=10, pady=10)  # pady doubled

        self.entry_player_name_param = tk.Entry(master)
        self.entry_player_name_param.grid(row=0, column=1, sticky='w', padx=10, pady=10)  # pady doubled

        self.label_accout_ID_param = tk.Label(master, text="dota2ID")
        self.label_accout_ID_param.grid(row=1, column=0, sticky='w', padx=10, pady=10)  # pady doubled

        self.entry_accout_ID_param = tk.Entry(master)
        self.entry_accout_ID_param.grid(row=1, column=1, sticky='w', padx=10, pady=10)  # pady doubled

        self.label_limit_param = tk.Label(master, text="抽取多少把比赛？")
        self.label_limit_param.grid(row=2, column=0, sticky='w', padx=10, pady=10)  # pady doubled

        self.entry_limit_param = tk.Entry(master)
        self.entry_limit_param.grid(row=2, column=1, sticky='w', padx=10, pady=10)  # pady doubled

        self.label_lobby_type_param = tk.Label(master, text="比赛类型是？")
        self.label_lobby_type_param.grid(row=3, column=0, sticky='w', padx=10, pady=10)  # pady doubled

        self.dropdown_values = {
            "天梯": 7,
            "普通": 0,
            "全部": -1
        }

        self.dropdown_var = tk.StringVar(master)
        self.dropdown_var.set("天梯")  # 设置默认选项
        self.dropdown_menu = ttk.Combobox(master, textvariable=self.dropdown_var, values=list(self.dropdown_values.keys()))
        self.dropdown_menu.grid(row=3, column=1, sticky='w', padx=10, pady=10)  # pady doubled

        self.submit_button = tk.Button(master, text="一键政审！", command=self.submit)
        self.submit_button.grid(row=4, column=1, sticky='w', padx=10, pady=20)  # Increased pady for more spacing

        self.result_text = tk.Text(master, wrap=tk.WORD, width=40, height=10)
        self.result_text.grid(row=0, column=2, rowspan=5, padx=(10,20), pady=(5,20), sticky='nsew')  # Added right and bottom padding

        # 设置默认值
        self.entry_player_name_param.insert(0, "maofeng")
        self.entry_accout_ID_param.insert(0, "136619313")
        self.entry_limit_param.insert(0, "1000")




        # Adjust the grid weights to allow the text box to expand
        master.grid_rowconfigure(4, weight=1)  # This will allow the last row to expand
        master.grid_columnconfigure(2, weight=1)  # This will allow the third column to expand
    
    def submit(self):
        player_name_param = self.entry_player_name_param.get()
        accout_ID_param = self.entry_accout_ID_param.get()
        limit_param = self.entry_limit_param.get()
        lobby_type_param = self.dropdown_values[self.dropdown_var.get()]      
          
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
